/**
 * Фигуры поля.
 *
 * Правило поля решает за каждую ячейку, где стоит фигура, куда она смотрит
 * и какого она размера (see glyph-field.js). Фигура знает только одно — как
 * себя нарисовать. Поэтому знак из треугольников, прежние стрелки и будущий
 * растр точек на обложках кейсов — один движок и три фигуры, а не три движка.
 *
 * Фигура:
 *   mode   — 'stroke' (линия, толщина растёт с яркостью) или 'fill' (заливка);
 *   params — свои параметры по умолчанию, поверх общих PARAMS поля;
 *   trace(path, x, y, ux, uy, len, p) — кладёт контур в Path2D или прямо
 *            в контекст канвы: у обоих одни и те же moveTo / lineTo.
 *            (x, y) — центр ячейки, (ux, uy) — единичное направление,
 *            len — размер фигуры вдоль направления, css-пиксели.
 */

export const SHAPES = {
  /** Стрелка: древко и два пера наконечника. Прежняя фигура знака. */
  arrow: {
    mode: 'stroke',
    params: {
      sizeMin: 0.28,   // длина при нулевом покрытии, доли ячейки
      sizeMax: 2.0,    // длина при полном покрытии
      headRatio: 0.13, // размер наконечника от длины
    },
    trace(path, ax, ay, ux, uy, len, p) {
      const halfX = ux * len * 0.5;
      const halfY = uy * len * 0.5;
      const hx = ax + halfX;
      const hy = ay + halfY;
      const hl = len * p.headRatio;
      const bx = ux * hl, by = uy * hl;
      const wx = uy * hl * 0.55, wy = ux * hl * 0.55;
      path.moveTo(ax - halfX, ay - halfY);
      path.lineTo(hx, hy);
      path.moveTo(hx, hy);
      path.lineTo(hx - bx - wx, hy - by + wy);
      path.moveTo(hx, hy);
      path.lineTo(hx - bx + wx, hy - by - wy);
    },
  },

  /**
   * Треугольник: равнобедренный, вершиной по направлению поля.
   * Центр тяжести стоит в центре ячейки — вершина на 2/3 высоты впереди,
   * основание на 1/3 позади, поэтому поворот не сдвигает фигуру с места.
   */
  triangle: {
    mode: 'fill',
    params: {
      sizeMin: 0.3,    // высота при нулевом покрытии, доли ячейки
      sizeMax: 1.2,    // высота при полном покрытии: больше — соседи слипаются
      base: 0.62,      // ширина основания от высоты
    },
    trace(path, ax, ay, ux, uy, len, p) {
      const fx = ax + ux * len * (2 / 3);
      const fy = ay + uy * len * (2 / 3);
      const cx = ax - ux * len * (1 / 3);
      const cy = ay - uy * len * (1 / 3);
      const hw = len * p.base * 0.5;
      path.moveTo(fx, fy);
      path.lineTo(cx - uy * hw, cy + ux * hw);
      path.lineTo(cx + uy * hw, cy - ux * hw);
      path.closePath();
    },
  },
};
