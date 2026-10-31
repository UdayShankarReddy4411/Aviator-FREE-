import React, { useEffect, useRef, useState } from 'react';
import { GameStatus } from '../types';
import { GAME_CONSTANTS } from '../constants';

interface FlightSceneProps {
  status: GameStatus;
  multiplier: number;
}

export const FlightScene: React.FC<FlightSceneProps> = ({ status, multiplier }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  
  // Parallax layers
  const starsRef = useRef<{ x: number; y: number; s: number }[]>([]);
  const cloudsRef = useRef<{ x: number; y: number; s: number; w: number }[]>([]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Initialize particles based on rough size
    starsRef.current = Array.from({ length: 100 }, () => ({
      x: Math.random() * 1200,
      y: Math.random() * 600,
      s: Math.random() * 2 + 0.5,
    }));
    
    cloudsRef.current = Array.from({ length: 15 }, () => ({
      x: Math.random() * 1200,
      y: Math.random() * 600,
      s: Math.random() * 4 + 1,
      w: Math.random() * 60 + 40,
    }));

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const animate = (time: number) => {
    if (!startTimeRef.current) startTimeRef.current = time;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const speed = status === GameStatus.FLYING ? Math.log(multiplier + 1) * 3 : 1;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw Background Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0a0a0f');
    grad.addColorStop(1, status === GameStatus.CRASHED ? '#2a0505' : '#1a0505');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Draw Stars (Parallax)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    starsRef.current.forEach(star => {
      star.x -= star.s * (speed * 0.5);
      if (star.x < 0) star.x = width;
      // Adjust y if it's out of bounds after resize
      if (star.y > height) star.y = Math.random() * height;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.s / 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Clouds
    ctx.fillStyle = status === GameStatus.CRASHED ? 'rgba(255, 46, 46, 0.1)' : 'rgba(255, 255, 255, 0.05)';
    cloudsRef.current.forEach(cloud => {
      cloud.x -= cloud.s * speed;
      if (cloud.x < -cloud.w) cloud.x = width;
      if (cloud.y > height) cloud.y = Math.random() * height;
      ctx.beginPath();
      ctx.ellipse(cloud.x, cloud.y, cloud.w, cloud.w / 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Runway (Idle/Ready)
    if (status === GameStatus.IDLE || status === GameStatus.READY || (status === GameStatus.FLYING && multiplier < 1.1)) {
       const runwayY = height - 50;
       
       ctx.strokeStyle = '#333';
       ctx.lineWidth = 4;
       ctx.beginPath();
       ctx.moveTo(0, runwayY);
       ctx.lineTo(width, runwayY);
       ctx.stroke();

       // Runway markings
       ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
       ctx.setLineDash([20, 20]);
       ctx.beginPath();
       ctx.moveTo(0, runwayY);
       ctx.lineTo(width, runwayY);
       ctx.stroke();
       ctx.setLineDash([]);
    }

    // Draw Plane
    const planeX = width / 3;
    const planeY = status === GameStatus.FLYING 
      ? height/2 - Math.sin(time / 500) * 15 - (Math.min(multiplier - 1, 0.5) * (height / 2))
      : height - 80;

    if (status !== GameStatus.CRASHED) {
      drawPlane(ctx, planeX, planeY, status === GameStatus.FLYING, width < 600);
      
      // Exhaust trail
      if (status === GameStatus.FLYING) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff2e2e';
        ctx.fillStyle = 'rgba(255, 46, 46, 0.6)';
        for(let i=0; i<5; i++) {
          ctx.beginPath();
          ctx.arc(planeX - 40 - Math.random()*20, planeY + 10 + Math.random()*5, 2 + Math.random()*4, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
    } else {
      // Explosion
      drawExplosion(ctx, planeX, planeY, time);
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  const drawPlane = (ctx: CanvasRenderingContext2D, x: number, y: number, isFlying: boolean, isSmall: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    if (isFlying) ctx.rotate(-Math.PI / 12);
    
    const scale = isSmall ? 0.7 : 1;
    ctx.scale(scale, scale);

    // Realistic detailed aircraft body
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, 20);
    bodyGrad.addColorStop(0, '#ff2e2e');
    bodyGrad.addColorStop(1, '#800000');

    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 46, 46, 0.5)';

    // Fuselage
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-45, 0, 85, 20, [10, 20, 5, 10]);
    ctx.fill();

    // Metallic sheen
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-40, 5);
    ctx.lineTo(35, 5);
    ctx.stroke();

    // Wings (Main)
    const wingGrad = ctx.createLinearGradient(0, 10, 0, 45);
    wingGrad.addColorStop(0, '#aa0000');
    wingGrad.addColorStop(1, '#440000');
    ctx.fillStyle = wingGrad;
    
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(15, 12);
    ctx.lineTo(0, 50);
    ctx.lineTo(-25, 45);
    ctx.closePath();
    ctx.fill();

    // Vertical Stabilizer (Tail)
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(-50, -25);
    ctx.lineTo(-30, -25);
    ctx.lineTo(-25, 0);
    ctx.closePath();
    ctx.fill();

    // Horizontal Stabilizer
    ctx.beginPath();
    ctx.moveTo(-45, 10);
    ctx.lineTo(-60, 5);
    ctx.lineTo(-60, 15);
    ctx.closePath();
    ctx.fill();

    // Cockpit Window
    const glassGrad = ctx.createRadialGradient(25, 5, 2, 25, 5, 8);
    glassGrad.addColorStop(0, '#00ffff');
    glassGrad.addColorStop(1, '#005555');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(25, 6, 12, 5, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Engine Detail
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(-5, 15, 20, 8, 2);
    ctx.fill();
    ctx.fillStyle = '#ff2e2e';
    ctx.fillRect(10, 17, 4, 4);

    ctx.restore();
  };

  const drawExplosion = (ctx: CanvasRenderingContext2D, x: number, y: number, time: number) => {
    const elapsed = (time % 1000) / 1000;
    const particles = 12;
    
    ctx.save();
    ctx.translate(x, y);
    
    for (let i = 0; i < particles; i++) {
      const angle = (i / particles) * Math.PI * 2;
      const dist = elapsed * 150;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      const size = (1 - elapsed) * 20;

      ctx.fillStyle = i % 2 === 0 ? '#ff0000' : '#ffa500';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff0000';
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [status, multiplier, dimensions]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[300px] md:h-[400px] overflow-hidden rounded-xl border border-glass-border shadow-2xl"
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
      
      {/* Glitch Overlay for Crashed state */}
      {status === GameStatus.CRASHED && (
        <div className="absolute inset-0 pointer-events-none bg-red-900/10 mix-blend-overlay">
          <div className="w-full h-full opacity-50 animate-pulse bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />
        </div>
      )}
    </div>
  );
};
