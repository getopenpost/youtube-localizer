import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Video } from '../core/model';
import { repository } from '../core/storage';
import { command } from '../platform/messages';
import { compose } from '../layers/render';
import {
  layerSchema,
  type LayerTemplate,
  type TextLayer,
} from '../layers/model';
import { Notice } from './shared';
export function LayerEditor({
  video,
  template,
  disabled,
  onAction,
}: {
  video: Video;
  template?: LayerTemplate;
  disabled: boolean;
  onAction: (task: () => Promise<unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TextLayer[]>();
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [validPreview, setValidPreview] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const layers = useMemo(
    () => draft ?? template?.layers ?? [],
    [draft, template?.layers],
  );
  useEffect(() => {
    if (!template?.backgroundAssetId) return;
    let canceled = false;
    let objectUrl = '';
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const asset = await repository.asset(template.backgroundAssetId!);
          if (!asset) throw new Error('Cached background is missing.');
          const blob = await compose(
            asset.blob,
            template.width,
            template.height,
            layerSchema.array().parse(layers),
            layers.map((l) => l.text),
            video.sourceLanguage ?? 'en',
          );
          if (canceled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreview(objectUrl);
          setPreviewError('');
          setValidPreview(JSON.stringify(layers));
        } catch (error) {
          if (!canceled) {
            setPreview('');
            setPreviewError(
              error instanceof Error ? error.message : 'Preview failed.',
            );
          }
        }
      })();
    }, 120);
    return () => {
      canceled = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    template?.backgroundAssetId,
    template?.width,
    template?.height,
    layers,
    video.sourceLanguage,
  ]);
  function update(values: Partial<TextLayer>) {
    setDraft(
      layers.map((layer, index) =>
        index === selected ? { ...layer, ...values } : layer,
      ),
    );
  }
  if (template?.state !== 'ready')
    return (
      <div className="layer-preparation">
        {template?.error && <Notice error>{template.error}</Notice>}
        {template?.state === 'waiting' && !template.error ? (
          <p role="status">Preparing editable text…</p>
        ) : (
          <>
            {template?.state === 'ambiguous' && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  disabled={disabled}
                />
                I checked Fal and accept a possible second charge.
              </label>
            )}
            <button
              className="secondary"
              disabled={
                disabled ||
                !video.thumbnailAssetId ||
                (template?.state === 'ambiguous' && !acknowledged)
              }
              onClick={() =>
                void onAction(() =>
                  template?.request
                    ? command({ type: 'retry-template', id: template.id })
                    : command({
                        type: 'prepare-template',
                        videoId: video.id,
                        acknowledged,
                      }),
                )
              }
            >
              {template?.request
                ? 'Retrieve saved preparation'
                : 'Prepare editable text · paid once'}
            </button>
          </>
        )}
      </div>
    );
  const layer = layers[selected];
  const dirty = draft !== undefined;
  return (
    <div className="layer-editor">
      <h4>Editable thumbnail</h4>
      {template.error && <Notice error>{template.error}</Notice>}
      {preview && (
        <div className="layer-canvas">
          <img
            src={preview}
            alt={`Editable thumbnail preview for ${video.title}`}
          />
          {dirty &&
            layers.map((value, index) => (
              <button
                key={value.id}
                type="button"
                className={`layer-box ${index === selected ? 'selected' : ''}`}
                aria-label={`Move text layer ${index + 1}`}
                disabled={disabled}
                style={{
                  left: `${(100 * value.x) / template.width}%`,
                  top: `${(100 * value.y) / template.height}%`,
                  width: `${(100 * value.width) / template.width}%`,
                  height: `${(100 * value.height) / template.height}%`,
                }}
                onPointerDown={(e) => {
                  if (disabled) return;
                  setSelected(index);
                  const button = e.currentTarget;
                  button.setPointerCapture(e.pointerId);
                  const parent = button.parentElement!.getBoundingClientRect();
                  const origin = { x: e.clientX, y: e.clientY, layer: value };
                  const move = (event: PointerEvent) =>
                    setDraft(
                      layers.map((l, i) =>
                        i === index
                          ? {
                              ...l,
                              x: Math.round(
                                origin.layer.x +
                                  ((event.clientX - origin.x) *
                                    template.width) /
                                    parent.width,
                              ),
                              y: Math.round(
                                origin.layer.y +
                                  ((event.clientY - origin.y) *
                                    template.height) /
                                    parent.height,
                              ),
                            }
                          : l,
                      ),
                    );
                  const end = () => {
                    button.removeEventListener('pointermove', move);
                    button.removeEventListener('pointerup', end);
                    button.removeEventListener('pointercancel', end);
                  };
                  button.addEventListener('pointermove', move);
                  button.addEventListener('pointerup', end);
                  button.addEventListener('pointercancel', end);
                }}
              />
            ))}
        </div>
      )}
      {previewError && <Notice error>{previewError}</Notice>}
      {!layers.length && (
        <p className="help">
          No text boxes were extracted. Add a box or approve the clean
          background.
        </p>
      )}
      <fieldset disabled={disabled} className="layer-fields">
        {layers.map((value, index) => (
          <label key={value.id}>
            Text {index + 1}
            <textarea
              rows={2}
              aria-label={`Layer ${index + 1} source text`}
              dir="auto"
              value={value.text}
              onFocus={() => setSelected(index)}
              onChange={(e) =>
                setDraft(
                  layers.map((l, i) =>
                    i === index ? { ...l, text: e.target.value } : l,
                  ),
                )
              }
            />
          </label>
        ))}
        <details
          className="layout-tools"
          onToggle={(e) => {
            if (e.currentTarget.open && !draft) setDraft(layers);
          }}
        >
          <summary>Adjust layout</summary>
          {layer && (
            <>
              <label>
                Text box
                <select
                  value={selected}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {layers.map((l, i) => (
                    <option key={l.id} value={i}>
                      Text {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <div className="layer-numbers">
                {(
                  [
                    'x',
                    'y',
                    'width',
                    'height',
                    'fontSize',
                    'rotation',
                    'lineHeight',
                    'strokeWidth',
                    'letterSpacing',
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {
                      (
                        {
                          x: 'Left',
                          y: 'Top',
                          width: 'Width',
                          height: 'Height',
                          fontSize: 'Font size',
                          rotation: 'Rotation',
                          lineHeight: 'Line height',
                          strokeWidth: 'Outline',
                          letterSpacing: 'Letter spacing',
                        } as const
                      )[key]
                    }
                    <input
                      aria-label={`Layer ${key}`}
                      type="number"
                      value={layer[key]}
                      step={key === 'lineHeight' ? 0.1 : 1}
                      onChange={(e) =>
                        update({ [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="layer-numbers">
                <label>
                  Font
                  <select
                    value={layer.fontFamily}
                    onChange={(e) =>
                      update({
                        fontFamily: e.target.value as TextLayer['fontFamily'],
                      })
                    }
                  >
                    {['Geist', 'Arial', 'Georgia', 'sans-serif', 'serif'].map(
                      (font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Weight
                  <select
                    value={layer.fontWeight}
                    onChange={(e) =>
                      update({ fontWeight: Number(e.target.value) })
                    }
                  >
                    {[400, 600, 700, 900].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Alignment
                  <select
                    value={layer.align}
                    onChange={(e) =>
                      update({ align: e.target.value as TextLayer['align'] })
                    }
                  >
                    {['left', 'center', 'right'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => update({ color: e.target.value })}
                  />
                </label>
                <label>
                  Outline color
                  <input
                    type="color"
                    value={layer.strokeColor}
                    onChange={(e) => update({ strokeColor: e.target.value })}
                  />
                </label>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setDraft(layers.filter((_, i) => i !== selected));
                  setSelected(0);
                }}
              >
                <Trash2 size={14} />
                Remove box
              </button>
            </>
          )}
          <button
            className="text-button"
            type="button"
            disabled={layers.length >= 30}
            onClick={() => {
              setDraft([
                ...layers,
                layerSchema.parse({
                  id: crypto.randomUUID(),
                  text: 'Text',
                  x: template.width * 0.1,
                  y: template.height * 0.65,
                  width: template.width * 0.8,
                  height: template.height * 0.25,
                  fontSize: Math.round(template.height * 0.12),
                }),
              ]);
              setSelected(layers.length);
            }}
          >
            <Plus size={14} />
            Add text box
          </button>
        </details>
        <button
          className="secondary"
          disabled={
            !!previewError ||
            validPreview !== JSON.stringify(layers) ||
            layers.some((l) => !l.text.trim()) ||
            (template.approved && !dirty)
          }
          onClick={() =>
            void onAction(async () => {
              await command({
                type: 'save-template',
                id: template.id,
                layers: layerSchema.array().parse(layers),
                approved: true,
              });
              setDraft(undefined);
            })
          }
        >
          {template.approved && !dirty ? 'Layout approved' : 'Approve layout'}
        </button>
      </fieldset>
    </div>
  );
}
