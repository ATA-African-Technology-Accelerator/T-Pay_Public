import { describe, expect, it } from 'vitest';
import { ValueObject } from '@tpay/shared/shared/domain/ValueObject';

interface PointProps {
  x: number;
  y: number;
}

class Point extends ValueObject<PointProps> {
  public static of(props: PointProps): Point {
    return new Point(props);
  }
}

describe('ValueObject', () => {
  it('treats objects with the same values as equal', () => {
    expect(Point.of({ x: 1, y: 2 }).equals(Point.of({ x: 1, y: 2 }))).toBe(true);
  });

  it('ignores property order when comparing', () => {
    expect(Point.of({ x: 1, y: 2 }).equals(Point.of({ y: 2, x: 1 }))).toBe(true);
  });

  it('treats objects with different values as different', () => {
    expect(Point.of({ x: 1, y: 2 }).equals(Point.of({ x: 9, y: 2 }))).toBe(false);
  });

  it('is not equal to nothing', () => {
    expect(Point.of({ x: 1, y: 2 }).equals(undefined)).toBe(false);
  });

  it('cannot be changed after creation', () => {
    const point = Point.of({ x: 1, y: 2 }) as unknown as { props: PointProps };

    expect(() => {
      point.props.x = 9;
    }).toThrow(TypeError);
  });
});