
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Marker } from '../types';

interface WaveformDisplayProps {
  audioBuffer: AudioBuffer | null;
  markers: Marker[];
  onMarkerDrag: (markerId: string, newPosition: number) => void;
  onWaveformClick: (position: number) => void;
  onMarkerClick: (markerId: string) => void;
  waveformHeight: number;
  selectedMarkerId: string | null;
  zoomLevel: number;
}

const BACKGROUND_COLOR = '#111827'; // gray-900
const WAVEFORM_COLOR = '#3b82f6'; // blue-500
const MARKER_COLOR = '#f87171'; // red-400
const SELECTED_MARKER_COLOR = '#fbbf24'; // amber-400
const TRIM_START_COLOR = '#10b981'; // emerald-500
const TRIM_END_COLOR = '#ef4444'; // red-500

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  audioBuffer,
  markers,
  onMarkerDrag,
  onWaveformClick,
  onMarkerClick,
  waveformHeight,
  selectedMarkerId,
  zoomLevel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMarkerId, setDragMarkerId] = useState<string | null>(null);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = scrollContainerRef.current;
    if (!canvas || !container || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    // Base width is the visible parent's width
    const visibleWidth = container.parentElement?.clientWidth || container.clientWidth;
    const canvasActualWidth = Math.floor(visibleWidth * zoomLevel);
    const displayHeight = waveformHeight;

    canvas.width = canvasActualWidth * devicePixelRatio;
    canvas.height = displayHeight * devicePixelRatio;
    canvas.style.width = `${canvasActualWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.clearRect(0, 0, canvasActualWidth, displayHeight);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvasActualWidth, displayHeight);

    const data = audioBuffer.getChannelData(0);
    const bufferLength = data.length;
    const step = Math.ceil(bufferLength / canvasActualWidth);
    const amp = displayHeight / 2;

    ctx.strokeStyle = WAVEFORM_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);

    for (let i = 0; i < canvasActualWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * step;
      const end = Math.min(start + step, bufferLength);
      for (let j = start; j < end; j++) {
        const datum = data[j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + max) * amp);
    }
    for (let i = canvasActualWidth - 1; i >= 0; i--) {
      let min = 1.0;
      let max = -1.0;
      const start = i * step;
      const end = Math.min(start + step, bufferLength);
      for (let j = start; j < end; j++) {
        const datum = data[j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + min) * amp);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, [audioBuffer, waveformHeight, zoomLevel]);

  useEffect(() => {
    drawWaveform();
    const handleResize = () => drawWaveform();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawWaveform]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const markerId = target.dataset.markerId;
    if (markerId) {
      e.stopPropagation();
      setIsDragging(true);
      setDragMarkerId(markerId);
      onMarkerClick(markerId);
    }
  }, [onMarkerClick]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragMarkerId || !containerRef.current || !scrollContainerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    
    // Position relative to the zoomed container
    const x = e.clientX - rect.left + scrollLeft;
    const totalWidth = rect.width;
    
    const newPosition = Math.max(0, Math.min(100, (x / totalWidth) * 100));
    onMarkerDrag(dragMarkerId, newPosition);
  }, [isDragging, dragMarkerId, onMarkerDrag]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragMarkerId(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    const target = e.target as HTMLElement;
    if (target.dataset.markerId) return;

    if (containerRef.current && scrollContainerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const totalWidth = rect.width;
      const position = (x / totalWidth) * 100;
      onWaveformClick(position);
    }
  }, [isDragging, onWaveformClick]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={scrollContainerRef}
      className="w-full h-full overflow-x-auto overflow-y-hidden select-none"
    >
      <div
        ref={containerRef}
        className="relative h-full"
        style={{ 
          height: `${waveformHeight}px`,
          width: `${100 * zoomLevel}%`,
          minWidth: '100%' 
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          className="block h-full cursor-crosshair"
        />
        {markers.map((marker) => {
          let markerColor = marker.id === selectedMarkerId ? SELECTED_MARKER_COLOR : MARKER_COLOR;
          if (marker.id === 'trim-start') markerColor = TRIM_START_COLOR;
          if (marker.id === 'trim-end') markerColor = TRIM_END_COLOR;

          return (
            <div
              key={marker.id}
              data-marker-id={marker.id}
              className={`absolute top-0 h-full w-1.5 transform -translate-x-1/2 cursor-grab z-10 hover:w-3 transition-[width] duration-75`}
              style={{
                left: `${marker.position}%`,
                backgroundColor: markerColor,
                boxShadow: marker.id.startsWith('trim') ? `0 0 10px ${markerColor}` : marker.id === selectedMarkerId ? `0 0 8px ${markerColor}` : 'none'
              }}
            >
              {marker.id.startsWith('trim') && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-inherit text-[9px] px-1 rounded-sm uppercase font-black text-white whitespace-nowrap pointer-events-none">
                  {marker.id === 'trim-start' ? 'Start' : 'End'}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isDragging && <div className="fixed inset-0 bg-transparent cursor-grabbing z-50"></div>}
    </div>
  );
};

export default WaveformDisplay;
