import { describe, it, expect } from 'vitest';
import { arrayToMultiMap } from './index.js';

describe('arrayToMultiMap', () => {
  it('should group items by key without value transformation', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'a', value: 3 },
      { id: 'c', value: 4 },
      { id: 'b', value: 5 },
    ];

    const result = arrayToMultiMap(items, (item) => item.id);

    expect(result.size).toBe(3);
    expect(result.get('a')).toEqual([
      { id: 'a', value: 1 },
      { id: 'a', value: 3 },
    ]);
    expect(result.get('b')).toEqual([
      { id: 'b', value: 2 },
      { id: 'b', value: 5 },
    ]);
    expect(result.get('c')).toEqual([{ id: 'c', value: 4 }]);
  });

  it('should group items by key with value transformation', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'a', value: 3 },
      { id: 'c', value: 4 },
      { id: 'b', value: 5 },
    ];

    const result = arrayToMultiMap(
      items,
      (item) => item.id,
      (item) => item.value,
    );

    expect(result.size).toBe(3);
    expect(result.get('a')).toEqual([1, 3]);
    expect(result.get('b')).toEqual([2, 5]);
    expect(result.get('c')).toEqual([4]);
  });

  it('should handle empty array', () => {
    const result = arrayToMultiMap([], (item: string) => item);

    expect(result.size).toBe(0);
  });

  it('should handle single item', () => {
    const items = [{ id: 'a', value: 1 }];

    const result = arrayToMultiMap(items, (item) => item.id);

    expect(result.size).toBe(1);
    expect(result.get('a')).toEqual([{ id: 'a', value: 1 }]);
  });

  it('should handle all items with same key', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'a', value: 2 },
      { id: 'a', value: 3 },
    ];

    const result = arrayToMultiMap(
      items,
      (item) => item.id,
      (item) => item.value,
    );

    expect(result.size).toBe(1);
    expect(result.get('a')).toEqual([1, 2, 3]);
  });

  it('should handle all items with different keys', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ];

    const result = arrayToMultiMap(items, (item) => item.id);

    expect(result.size).toBe(3);
    expect(result.get('a')).toEqual([{ id: 'a', value: 1 }]);
    expect(result.get('b')).toEqual([{ id: 'b', value: 2 }]);
    expect(result.get('c')).toEqual([{ id: 'c', value: 3 }]);
  });

  it('should handle complex key extraction', () => {
    interface Trade {
      tradeId: number;
      symbol: string;
    }

    const trades: Trade[] = [
      { tradeId: 12345, symbol: 'BTCUSDT' },
      { tradeId: 123456, symbol: 'ETHUSDT' },
      { tradeId: 134567, symbol: 'BTCUSDT' },
    ];

    const result = arrayToMultiMap(
      trades,
      (trade) => `${Math.floor(trade.tradeId / 1e5)}`,
    );

    expect(result.size).toBe(2);
    expect(result.get('0')).toEqual([{ tradeId: 12345, symbol: 'BTCUSDT' }]);
    expect(result.get('1')).toEqual([
      { tradeId: 123456, symbol: 'ETHUSDT' },
      { tradeId: 134567, symbol: 'BTCUSDT' },
    ]);
  });

  it('should handle value transformation to different type', () => {
    interface Item {
      category: string;
      price: number;
      name: string;
    }

    const items: Item[] = [
      { category: 'electronics', price: 100, name: 'Phone' },
      { category: 'electronics', price: 200, name: 'Laptop' },
      { category: 'food', price: 10, name: 'Apple' },
    ];

    const result = arrayToMultiMap(
      items,
      (item) => item.category,
      (item) => ({ name: item.name, price: item.price }),
    );

    expect(result.size).toBe(2);
    expect(result.get('electronics')).toEqual([
      { name: 'Phone', price: 100 },
      { name: 'Laptop', price: 200 },
    ]);
    expect(result.get('food')).toEqual([{ name: 'Apple', price: 10 }]);
  });
});
