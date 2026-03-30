import type { QueueItem, CanvasPage, Snippet } from '../types';

export function buildPagePayload(
  item: QueueItem,
  canvasPages: CanvasPage[],
  snippets: Snippet[]
) {
  if (item.type === 'canvas') {
    const cp = canvasPages.find((p) => p.id === item.canvasPageId);
    if (!cp) throw new Error('Canvas page not found');
    return {
      type: 'canvas' as const,
      canvasPage: {
        pageSize: cp.pageSize,
        ...(cp.pageSize === 'custom' ? { customWidth: cp.customWidth, customHeight: cp.customHeight } : {}),
        elements: cp.elements.map((el) => {
          const base = {
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            rotation: el.rotation || 0,
          };
          switch (el.type) {
            case 'snippet': {
              const snippet = snippets.find((s) => s.id === el.snippetId);
              if (!snippet) throw new Error('Snippet not found');
              return {
                ...base,
                type: 'snippet' as const,
                fileId: snippet.fileId,
                pageIndex: snippet.pageIndex,
                cropBox: el.cropBoxOverride || snippet.cropBox,
                cropInset: el.cropInset,
              };
            }
            case 'text':
              return {
                ...base,
                type: 'text' as const,
                text: el.text,
                fontSize: el.fontSize,
                fontFamily: el.fontFamily,
                bold: el.bold,
                italic: el.italic,
                textColor: el.textColor,
                textAlign: el.textAlign,
                backgroundColor: el.backgroundColor,
              };
            case 'shape':
              return {
                ...base,
                type: 'shape' as const,
                shapeKind: el.shapeKind,
                fillColor: el.fillColor,
                strokeColor: el.strokeColor,
                strokeWidth: el.strokeWidth,
                arrowHead: el.arrowHead,
                ...(el.startPoint ? { startPoint: el.startPoint } : {}),
                ...(el.endPoint ? { endPoint: el.endPoint } : {}),
              };
            case 'drawing':
              return {
                ...base,
                type: 'drawing' as const,
                points: el.points,
                strokeColor: el.strokeColor,
                strokeWidth: el.strokeWidth,
              };
            case 'highlight':
              return {
                ...base,
                type: 'highlight' as const,
                points: el.points,
                color: el.color,
                opacity: el.opacity,
                strokeWidth: el.strokeWidth,
              };
            case 'hyperlink':
              return {
                ...base,
                type: 'hyperlink' as const,
                text: el.text,
                url: el.url,
                fontSize: el.fontSize,
                fontFamily: el.fontFamily,
              };
            case 'textHighlight':
              return {
                ...base,
                type: 'textHighlight' as const,
                color: el.color,
                opacity: el.opacity,
              };
          }
        }),
      },
    };
  }
  return {
    fileId: item.fileId,
    pageIndex: item.pageIndex,
    type: item.type,
    pageSize: item.pageSize,
  };
}

export function buildAllPages(
  queue: QueueItem[],
  canvasPages: CanvasPage[],
  snippets: Snippet[]
) {
  return queue.map((item) => buildPagePayload(item, canvasPages, snippets));
}
