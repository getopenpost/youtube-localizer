<script lang="ts">
  import '@fontsource/geist/400.css';
  import '@fontsource/geist/600.css';
  import { untrack } from 'svelte';
  import {
    Button,
    Input,
    Textarea,
    ThemeIcon,
    NativeSelect,
    CheckboxInput,
  } from '@openpost/ui';
  import type { Video } from '../core/model';
  import { repository } from '../core/storage';
  import { command } from '../platform/messages';
  import { compose } from '../layers/render';
  import {
    layerSchema,
    type LayerTemplate,
    type TextLayer,
  } from '../layers/model';
  import Notice from './Notice.svelte';
  let {
    video,
    template,
    disabled,
    onAction,
  }: {
    video: Video;
    template?: LayerTemplate;
    disabled: boolean;
    onAction: (task: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let draft = $state<TextLayer[]>();
  let selected = $state(0);
  let preview = $state('');
  let previewError = $state('');
  let validPreview = $state('');
  let acknowledged = $state(false);
  let layers = $derived.by(() => draft ?? template?.layers ?? []);
  $effect(() => {
    void template?.backgroundAssetId;
    void template?.width;
    void template?.height;
    void layers;
    void video.sourceLanguage;
    return untrack(() => {
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
            preview = objectUrl;
            previewError = '';
            validPreview = JSON.stringify(layers);
          } catch (error) {
            if (!canceled) {
              preview = '';
              previewError =
                error instanceof Error ? error.message : 'Preview failed.';
            }
          }
        })();
      }, 120);
      return () => {
        canceled = true;
        clearTimeout(timer);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    });
  });
  function update(values: Partial<TextLayer>) {
    draft = layers.map((layer, index) =>
      index === selected ? { ...layer, ...values } : layer,
    );
  }
  const layer = $derived(layers[selected]);
  const dirty = $derived(draft !== undefined);
</script>

{#if template?.state !== 'ready'}<div class="layer-preparation">
    {#if template?.error}<Notice error>{template.error}</Notice
      >{/if}{#if template?.state === 'waiting' && !template.error}<p
        role="status"
      >
        Preparing editable text…
      </p>{:else}{#if template?.state === 'ambiguous'}<label
          class="checkbox-label"
          ><CheckboxInput
            checked={acknowledged}
            onchange={(e) => (acknowledged = e.currentTarget.checked)}
            {disabled}
          />I checked Fal and accept a possible second charge.
        </label>{/if}<Button
        class="secondary"
        intent="ordinary"
        disabled={disabled ||
          !video.thumbnailAssetId ||
          (template?.state === 'ambiguous' && !acknowledged)}
        onclick={() =>
          void onAction(() =>
            template?.request
              ? command({ type: 'retry-template', id: template.id })
              : command({
                  type: 'prepare-template',
                  videoId: video.id,
                  acknowledged,
                }),
          )}
        >{template?.request
          ? 'Retrieve saved preparation'
          : 'Prepare text layers'}</Button
      >{/if}
  </div>{:else}<div class="layer-editor">
    <h4>Editable thumbnail</h4>
    {#if template.error}<Notice error>{template.error}</Notice
      >{/if}{#if preview}<div class="layer-canvas">
        <img
          src={preview}
          alt={`Editable thumbnail preview for ${video.title}`}
        />{#if dirty}{#each layers as value, index (value.id)}<button
              type="button"
              class={`layer-box ${index === selected ? 'selected' : ''}`}
              aria-label={`Move text layer ${index + 1}`}
              {disabled}
              style:left={`${(100 * value.x) / template.width}%`}
              style:top={`${(100 * value.y) / template.height}%`}
              style:width={`${(100 * value.width) / template.width}%`}
              style:height={`${(100 * value.height) / template.height}%`}
              onpointerdown={(e) => {
                if (disabled) return;
                selected = index;
                const button = e.currentTarget;
                button.setPointerCapture(e.pointerId);
                const parent = button.parentElement!.getBoundingClientRect();
                const origin = { x: e.clientX, y: e.clientY, layer: value };
                const move = (event: PointerEvent) =>
                  (draft = layers.map((l, i) =>
                    i === index
                      ? {
                          ...l,
                          x: Math.round(
                            origin.layer.x +
                              ((event.clientX - origin.x) * template.width) /
                                parent.width,
                          ),
                          y: Math.round(
                            origin.layer.y +
                              ((event.clientY - origin.y) * template.height) /
                                parent.height,
                          ),
                        }
                      : l,
                  ));
                const end = () => {
                  button.removeEventListener('pointermove', move);
                  button.removeEventListener('pointerup', end);
                  button.removeEventListener('pointercancel', end);
                };
                button.addEventListener('pointermove', move);
                button.addEventListener('pointerup', end);
                button.addEventListener('pointercancel', end);
              }}
            ></button>{/each}{/if}
      </div>{/if}{#if previewError}<Notice error>{previewError}</Notice
      >{/if}{#if !layers.length}<p class="help">
        No text boxes were extracted. Add a box or approve the clean background.
      </p>{/if}
    <fieldset {disabled} class="layer-fields">
      {#each layers as value, index (value.id)}<label
          >Text {index + 1}<Textarea
            rows={2}
            aria-label={`Layer ${index + 1} source text`}
            dir="auto"
            value={value.text}
            onfocus={() => (selected = index)}
            oninput={(e) =>
              (draft = layers.map((l, i) =>
                i === index ? { ...l, text: e.currentTarget.value } : l,
              ))}
          ></Textarea></label
        >{/each}
      <details
        class="layout-tools"
        ontoggle={(e) => {
          if (e.currentTarget.open && !draft) draft = layers;
        }}
      >
        <summary>Adjust layout</summary>{#if layer}<label
            >Text box <NativeSelect
              value={selected}
              onchange={(e) => (selected = Number(e.currentTarget.value))}
              >{#each layers as l, i (l.id)}<option value={i}
                  >Text {i + 1}</option
                >{/each}</NativeSelect
            ></label
          >
          <div class="layer-numbers">
            {#each ['x', 'y', 'width', 'height', 'fontSize', 'rotation', 'lineHeight', 'strokeWidth', 'letterSpacing'] as const as key (key)}<label
                >{(
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
                )[key]}<Input
                  aria-label={`Layer ${key}`}
                  type="number"
                  value={layer[key]}
                  step={key === 'lineHeight' ? 0.1 : 1}
                  oninput={(e) =>
                    update({ [key]: Number(e.currentTarget.value) })}
                ></Input></label
              >{/each}
          </div>
          <div class="layer-numbers">
            <label
              >Font <NativeSelect
                value={layer.fontFamily}
                onchange={(e) =>
                  update({
                    fontFamily: e.currentTarget
                      .value as TextLayer['fontFamily'],
                  })}
                >{#each ['Geist', 'Arial', 'Georgia', 'sans-serif', 'serif'] as font (font)}<option
                    value={font}>{font}</option
                  >{/each}</NativeSelect
              ></label
            ><label
              >Weight <NativeSelect
                value={layer.fontWeight}
                onchange={(e) =>
                  update({ fontWeight: Number(e.currentTarget.value) })}
                >{#each [400, 600, 700, 900] as w (w)}<option value={w}
                    >{w}</option
                  >{/each}</NativeSelect
              ></label
            ><label
              >Alignment <NativeSelect
                value={layer.align}
                onchange={(e) =>
                  update({
                    align: e.currentTarget.value as TextLayer['align'],
                  })}
                >{#each ['left', 'center', 'right'] as v (v)}<option value={v}
                    >{v}</option
                  >{/each}</NativeSelect
              ></label
            ><label
              >Color <Input
                type="color"
                value={layer.color}
                oninput={(e) => update({ color: e.currentTarget.value })}
              ></Input></label
            ><label
              >Outline color <Input
                type="color"
                value={layer.strokeColor}
                oninput={(e) => update({ strokeColor: e.currentTarget.value })}
              ></Input></label
            >
          </div>
          <Button
            class="text-button"
            intent="quiet"
            type="button"
            onclick={() => {
              draft = layers.filter((_, i) => i !== selected);
              selected = 0;
            }}
            ><ThemeIcon role="delete" width={14} height={14}></ThemeIcon>Remove
            box
          </Button>{/if}<Button
          class="text-button"
          intent="quiet"
          type="button"
          disabled={layers.length >= 30}
          onclick={() => {
            const newIndex = layers.length;
            draft = [
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
            ];
            selected = newIndex;
          }}
          ><ThemeIcon role="add" width={14} height={14}></ThemeIcon>Add text box
        </Button>
      </details>
      <Button
        class="secondary"
        intent="ordinary"
        disabled={!!previewError ||
          validPreview !== JSON.stringify(layers) ||
          layers.some((l) => !l.text.trim()) ||
          (template.approved && !dirty)}
        onclick={() =>
          void onAction(async () => {
            await command({
              type: 'save-template',
              id: template.id,
              layers: layerSchema.array().parse(layers),
              approved: true,
            });
            draft = undefined;
          })}
        >{template.approved && !dirty
          ? 'Layout approved'
          : 'Approve layout'}</Button
      >
    </fieldset>
  </div>{/if}
