import type { PhotoFrameSpec } from '../types';

export function photoFrameGeometry(width: number, height: number, frame: PhotoFrameSpec, sourceWidth?: number, sourceHeight?: number) {
  const material = frame.kind !== 'none';
  const allowance = material ? frame.insetRatio * 2 + frame.footerRatio : 0;
  // A physical print fits inside its composition cell; a thick instant-photo
  // footer must never flatten a landscape photo into a sliver.
  const printRatio = material && sourceWidth && sourceHeight
    ? (1 - frame.insetRatio * 2) * sourceHeight / sourceWidth + allowance : undefined;
  const outerWidth = printRatio ? Math.min(width, height / printRatio) : width;
  const outerHeight = printRatio ? outerWidth * printRatio : height;
  const outerX = (width - outerWidth) / 2, outerY = (height - outerHeight) / 2;
  const unit = allowance ? Math.min(outerWidth, Math.max(0, outerHeight - 1) / allowance) : outerWidth;
  const inset = material ? unit * frame.insetRatio : 0;
  const footer = material ? unit * frame.footerRatio : 0;
  return { x: outerX + inset, y: outerY + inset, width: Math.max(1, outerWidth - inset * 2), height: Math.max(1, outerHeight - inset * 2 - footer), outerX, outerY, outerWidth, outerHeight, inset, footer, shadow: outerWidth * frame.shadowRatio };
}

export function filmPerforationPath(width: number, height: number, inset: number): string {
  if (inset < 1) return '';
  const holeWidth = inset * .52;
  const holeHeight = Math.min(inset * .65, (height - inset * 2) / 3);
  if (holeHeight <= 0) return '';
  const count = Math.max(1, Math.floor((height - inset * 2) / (inset * 1.8)));
  const step = (height - inset * 2) / count;
  const radius = Math.min(holeWidth, holeHeight) * .18;
  let path = '';
  for (let column = 0; column < 2; column++) {
    const x = column ? width - (inset + holeWidth) / 2 : (inset - holeWidth) / 2;
    for (let index = 0; index < count; index++) {
      const y = inset + (index + .5) * step - holeHeight / 2;
      path += `M ${x + radius} ${y} H ${x + holeWidth - radius} Q ${x + holeWidth} ${y} ${x + holeWidth} ${y + radius} V ${y + holeHeight - radius} Q ${x + holeWidth} ${y + holeHeight} ${x + holeWidth - radius} ${y + holeHeight} H ${x + radius} Q ${x} ${y + holeHeight} ${x} ${y + holeHeight - radius} V ${y + radius} Q ${x} ${y} ${x + radius} ${y} Z `;
    }
  }
  return path;
}
