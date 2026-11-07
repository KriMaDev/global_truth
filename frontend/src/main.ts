/**
 * Placeholder page: a subtle, slowly twinkling starfield behind the "coming soon" card.
 * Respects prefers-reduced-motion (stars are drawn once and stay still).
 */

interface Star {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
}

const STARS_PER_PIXEL = 1 / 2500;

function makeStars(width: number, height: number): Star[] {
  const count = Math.round(width * height * STARS_PER_PIXEL);
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 1.1 + 0.2,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.6 + 0.2,
  }));
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], timeSeconds: number): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  for (const star of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(star.phase + timeSeconds * star.speed);
    ctx.globalAlpha = twinkle;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius * devicePixelRatio, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function startStarfield(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stars: Star[] = [];
  let frame = 0;

  const resize = (): void => {
    canvas.width = Math.round(canvas.clientWidth * devicePixelRatio);
    canvas.height = Math.round(canvas.clientHeight * devicePixelRatio);
    stars = makeStars(canvas.width, canvas.height);
    drawStars(ctx, stars, 0);
  };

  const animate = (now: number): void => {
    drawStars(ctx, stars, now / 1000);
    frame = requestAnimationFrame(animate);
  };

  const applyMotionPreference = (): void => {
    cancelAnimationFrame(frame);
    if (reducedMotion.matches) {
      drawStars(ctx, stars, 0);
    } else {
      frame = requestAnimationFrame(animate);
    }
  };

  resize();
  applyMotionPreference();
  window.addEventListener("resize", resize);
  reducedMotion.addEventListener("change", applyMotionPreference);
}

const canvas = document.querySelector<HTMLCanvasElement>("#stars");
if (canvas) startStarfield(canvas);
