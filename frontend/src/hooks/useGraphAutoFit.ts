import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useLayoutEffect } from "react";
import type { LayoutGraph } from "../layout";

const GRAPH_VERTICAL_MARGIN = 44;
const GRAPH_HORIZONTAL_MARGIN = 44;
const FIT_SCALE_EPSILON = 0.001;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 2.25;

export type FitMode = "height" | "width";

type UseGraphAutoFitOptions = {
  fitMode: FitMode;
  contentWidth: number;
};

export function useGraphAutoFit(
  laidOut: LayoutGraph | null,
  canvasRef: RefObject<HTMLDivElement | null>,
  setScale: Dispatch<SetStateAction<number>>,
  { fitMode, contentWidth }: UseGraphAutoFitOptions,
) {
  const fitGraphToCanvas = useCallback(
    ({ resetScroll = true }: { resetScroll?: boolean } = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || !laidOut) {
        return;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const graphHeight = Math.max(1, laidOut.height);
      const graphWidth = Math.max(1, contentWidth);
      const availableHeight = Math.max(80, canvasRect.height - GRAPH_VERTICAL_MARGIN);
      const availableWidth = Math.max(120, canvasRect.width - GRAPH_HORIZONTAL_MARGIN);
      const fitRatio = fitMode === "width" ? availableWidth / graphWidth : availableHeight / graphHeight;
      const nextScale = clampZoom(Math.min(fitRatio, 1.05));
      const roundedScale = Number(nextScale.toFixed(3));
      setScale((current) => (Math.abs(current - roundedScale) < FIT_SCALE_EPSILON ? current : roundedScale));
      if (resetScroll && (canvas.scrollLeft !== 0 || canvas.scrollTop !== 0)) {
        canvas.scrollTo({ left: 0, top: 0 });
      }
    },
    [canvasRef, contentWidth, fitMode, laidOut, setScale],
  );

  useLayoutEffect(() => {
    fitGraphToCanvas({ resetScroll: true });
  }, [fitGraphToCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fitGraphToCanvas({ resetScroll: false }));
    });
    observer.observe(canvas);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [canvasRef, fitGraphToCanvas]);

  return fitGraphToCanvas;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
