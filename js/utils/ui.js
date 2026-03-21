const ctx = canvas.getContext('2d');

export function inRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

export function drawButton(
  x,
  y,
  w,
  h,
  bgColor,
  text,
  fontSize = 24,
  textColor = '#ffffff'
) {
  ctx.save();

  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);

  ctx.restore();
}