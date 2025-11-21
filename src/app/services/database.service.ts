import Dexie, { Table } from 'dexie';
import { Injectable } from '@angular/core';
import { Ticket, TicketList } from '../models/ticket.model';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  tickets!: Table<Ticket, number>;
  ticketLists!: Table<TicketList, string>;

  constructor() {
    super('VibingDB');
    
    this.version(1).stores({
      tickets: '++id, title, listId, order',
      ticketLists: 'id, name, order'
    });

    // Version 2: Migrate "In Progress" to "Ongoing"
    this.version(2).stores({
      tickets: '++id, title, listId, order',
      ticketLists: 'id, name, order'
    }).upgrade(async (tx) => {
      try {
        const list = await tx.table('ticketLists').get('in-progress');
        if (list && list.name === 'In Progress') {
          await tx.table('ticketLists').update('in-progress', { name: 'Ongoing' });
        }
      } catch (error) {
        console.error('Migration error: Failed to update list name from "In Progress" to "Ongoing"', error);
      }
    });

    // Version 3: Add "Blocked" column between "Ongoing" and "Done"
    this.version(3).stores({
      tickets: '++id, title, listId, order',
      ticketLists: 'id, name, order'
    }).upgrade(async (tx) => {
      try {
        // Update "Done" list order from 2 to 3
        const doneList = await tx.table('ticketLists').get('done');
        if (doneList) {
          await tx.table('ticketLists').update('done', { order: 3 });
        } else {
          console.warn('Migration warning: "Done" list not found during migration');
        }
        
        // Add "Blocked" list with order 2
        const blockedList = await tx.table('ticketLists').get('blocked');
        if (!blockedList) {
          await tx.table('ticketLists').add({ id: 'blocked', name: 'Blocked', order: 2 });
        }
      } catch (error) {
        console.error('Migration error: Failed to add "Blocked" list', error);
      }
    });
  }

  async initializeDefaultLists(): Promise<void> {
    const count = await this.ticketLists.count();
    if (count === 0) {
      await this.ticketLists.bulkAdd([
        { id: 'todo', name: 'To Do', order: 0 },
        { id: 'in-progress', name: 'Ongoing', order: 1 },
        { id: 'blocked', name: 'Blocked', order: 2 },
        { id: 'done', name: 'Done', order: 3 }
      ]);
    }
  }

  async addTicket(ticket: Omit<Ticket, 'id'>): Promise<number> {
    return await this.tickets.add(ticket as Ticket);
  }

  async updateTicket(id: number, changes: Partial<Ticket>): Promise<number> {
    return await this.tickets.update(id, changes);
  }

  async deleteTicket(id: number): Promise<void> {
    await this.tickets.delete(id);
  }

  async getTicketsByList(listId: string): Promise<Ticket[]> {
    return await this.tickets
      .where('listId')
      .equals(listId)
      .sortBy('order');
  }

  async getAllTickets(): Promise<Ticket[]> {
    return await this.tickets.toArray();
  }

  async getAllLists(): Promise<TicketList[]> {
    return await this.ticketLists.orderBy('order').toArray();
  }

  async moveTicket(ticketId: number, newListId: string, newOrder: number): Promise<void> {
    await this.updateTicket(ticketId, { listId: newListId, order: newOrder });
  }

  async reorderTickets(listId: string, ticketIds: number[]): Promise<void> {
    await this.transaction('rw', this.tickets, async () => {
      for (let i = 0; i < ticketIds.length; i++) {
        await this.updateTicket(ticketIds[i], { order: i });
      }
    });
  }
}
