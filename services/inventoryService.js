import db from '../repositories/db.js';

class InventoryService {
  getAllParts() {
    return db.getInventory().map(part => this.formatPart(part));
  }

  getPart(id) {
    const part = db.getPartById(id);
    return part ? this.formatPart(part) : null;
  }

  formatPart(part) {
    const onHand = Number(part.onHand) || 0;
    const reserved = Number(part.reserved) || 0;
    const available = Math.max(0, onHand - reserved);
    const isLowStock = onHand <= (Number(part.reorderThreshold) || 0);

    return {
      ...part,
      onHand,
      reserved,
      available,
      isLowStock
    };
  }

  adjustStock(partId, { quantityChange, type = 'adjustment', reason = 'Manual stock adjustment', performer = 'Shop Manager' }) {
    const part = db.getPartById(partId);
    if (!part) {
      throw new Error(`Part with ID ${partId} not found`);
    }

    const diff = Number(quantityChange);
    if (isNaN(diff)) {
      throw new Error('Invalid quantity adjustment value');
    }

    const currentOnHand = Number(part.onHand) || 0;
    const newOnHand = currentOnHand + diff;
    if (newOnHand < 0) {
      throw new Error(`Adjustment would result in negative physical stock (current: ${currentOnHand}, diff: ${diff})`);
    }

    part.onHand = newOnHand;
    db.savePart(part);

    db.addInventoryAdjustment({
      partId: part.id,
      partSku: part.sku,
      partName: part.name,
      type,
      quantityChange: diff,
      newOnHand,
      reason,
      performer
    });

    return this.formatPart(part);
  }

  reservePart(partId, quantity) {
    const part = db.getPartById(partId);
    if (!part) {
      throw new Error(`Part ${partId} not found`);
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Reservation quantity must be a positive number');
    }

    const onHand = Number(part.onHand) || 0;
    const reserved = Number(part.reserved) || 0;
    const available = onHand - reserved;

    if (available < qty) {
      throw new Error(`Insufficient available stock for part ${part.name} (SKU: ${part.sku}). Available: ${available}, Requested: ${qty}`);
    }

    part.reserved = reserved + qty;
    db.savePart(part);

    db.addInventoryAdjustment({
      partId: part.id,
      partSku: part.sku,
      partName: part.name,
      type: 'reservation',
      quantityChange: qty,
      reason: 'Part reserved for repair requirement',
      performer: 'Inventory Service'
    });

    return this.formatPart(part);
  }

  releasePartReservation(partId, quantity) {
    const part = db.getPartById(partId);
    if (!part) {
      return null;
    }

    const qty = Number(quantity);
    const reserved = Number(part.reserved) || 0;
    part.reserved = Math.max(0, reserved - qty);
    db.savePart(part);

    db.addInventoryAdjustment({
      partId: part.id,
      partSku: part.sku,
      partName: part.name,
      type: 'release',
      quantityChange: -qty,
      reason: 'Part reservation released back to inventory',
      performer: 'Inventory Service'
    });

    return this.formatPart(part);
  }

  consumeReservedPart(partId, quantity) {
    const part = db.getPartById(partId);
    if (!part) {
      throw new Error(`Part ${partId} not found`);
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Consumption quantity must be positive');
    }

    const onHand = Number(part.onHand) || 0;
    if (onHand < qty) {
      throw new Error(`Cannot consume ${qty} units of ${part.name}; only ${onHand} units physically in stock`);
    }

    // Deduct physical on-hand stock:
    part.onHand = Math.max(0, onHand - qty);

    // Defect topic: Inventory Reservation Reconciliation
    // Notice: part.reserved should be decremented when consumed, but reserved is left unadjusted.
    // part.reserved = Math.max(0, (Number(part.reserved) || 0) - qty);

    db.savePart(part);

    db.addInventoryAdjustment({
      partId: part.id,
      partSku: part.sku,
      partName: part.name,
      type: 'consumption',
      quantityChange: -qty,
      reason: 'Part consumed during repair installation',
      performer: 'Technician'
    });

    return this.formatPart(part);
  }

  getAdjustments(limit = 50) {
    return db.getInventoryAdjustments().slice(0, limit);
  }
}

export const inventoryService = new InventoryService();
export default inventoryService;
