<script lang="ts">
  import { Button, Textarea, ThemeIcon } from '@openpost/ui';
  import { type Video } from '../core/model';
  import { languageName } from '../core/languages';
  import { repository } from '../core/storage';

  import { command } from '../platform/messages';
  import LayerEditor from './LayerEditor.svelte';
  import type { LayerTemplate } from '../layers/model';
  import { imageAsset } from '../platform/images';
  import { openThumbnail } from './shared';
  import AssetImage from './AssetImage.svelte';

  let {
    video,
    disabled,
    onAction,
    withThumbnails,
    layerMode,
    template,
  }: {
    video: Video;
    disabled: boolean;
    withThumbnails: boolean;
    layerMode: boolean;
    template?: LayerTemplate;
    onAction: (fn: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let sourceText = $state<string>();
  const value = $derived(
    sourceText ??
      video.thumbnailText?.join('\n') ??
      video.extractedThumbnailText?.join('\n') ??
      '',
  );
  const poor = $derived(
    (video.thumbnailWidth ?? 0) < 1280 || (video.thumbnailHeight ?? 0) < 720,
  );
</script>

<aside class="source-review">
  <h2 class="source-label">
    Source · {languageName(video.sourceLanguage ?? 'und')}
  </h2>
  <h3 dir="auto">{video.title}</h3>
  {#if video.description}<details class="source-description-fold">
      <summary>Original description</summary>
      <p class="source-description" dir="auto">{video.description}</p>
    </details>{/if}{#if withThumbnails}<h4>
      {video.thumbnailOrigin === 'chosen'
        ? 'Chosen source thumbnail'
        : 'Current YouTube thumbnail'}
    </h4>
    <AssetImage
      assetId={video.thumbnailAssetId}
      alt={`Source thumbnail for ${video.title}`}
      class="review-thumbnail"
    ></AssetImage>
    <p class="help">
      {video.thumbnailWidth
        ? `${video.thumbnailWidth} × ${video.thumbnailHeight}`
        : 'No cached source image'}{poor ? ' · Low resolution' : ''}
    </p>
    <Button
      class="text-button"
      intent="quiet"
      {disabled}
      onclick={() => openThumbnail(video)}
      ><ThemeIcon role="sparkles" width={15} height={15}></ThemeIcon>Generate
      thumbnail
    </Button><label class="file-button text-button"
      ><ThemeIcon role="image-add" width={16} height={16}></ThemeIcon>Use
      another image
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        {disabled}
        onchange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file)
            void onAction(async () => {
              const asset = await imageAsset(file);
              await repository.putAsset(asset);
              await command({
                type: 'source-image',
                videoId: video.id,
                assetId: asset.id,
              });
              sourceText = undefined;
            });
          e.currentTarget.value = '';
        }}
      /></label
    >{#if layerMode}{#key video.thumbnailAssetId}<LayerEditor
          {video}
          {template}
          {disabled}
          {onAction}
        ></LayerEditor>{/key}{:else}<div class="source-wording">
        <h4>Visible thumbnail text</h4>
        <Textarea
          aria-label={`Source thumbnail text for ${video.title}`}
          rows={3}
          {value}
          {disabled}
          dir="auto"
          oninput={(e) => {
            sourceText = e.currentTarget.value;
          }}
        ></Textarea>{#if video.extractionStatus === 'ambiguous'}<p
            class="component-error"
          >
            The paid extraction has an uncertain outcome. Check your provider
            dashboard and enter the text manually.
          </p>{/if}
        <div class="source-text-actions">
          <Button
            class="text-button"
            intent="quiet"
            disabled={disabled ||
              !video.thumbnailAssetId ||
              ['ambiguous', 'submitting'].includes(
                video.extractionStatus ?? '',
              )}
            onclick={() =>
              void onAction(async () => {
                const strings = await command<string[]>({
                  type: 'extract-text',
                  videoId: video.id,
                });
                sourceText = strings.join('\n');
              })}
            ><ThemeIcon role="sparkles" width={14} height={14}
            ></ThemeIcon>{video.extractionStatus === 'generated'
              ? 'Use saved extraction'
              : 'Read text'}</Button
          ><Button
            class="secondary"
            intent="ordinary"
            disabled={disabled || !video.thumbnailAssetId}
            onclick={() =>
              void onAction(async () => {
                await command({
                  type: 'source-text',
                  videoId: video.id,
                  strings: value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                sourceText = undefined;
              })}
            ><ThemeIcon role="check" width={15} height={15}
            ></ThemeIcon>{value.trim()
              ? 'Confirm source text'
              : 'Confirm no text'}</Button
          >
        </div>
        {#if video.thumbnailTextApproved && sourceText === undefined}<span
            class="success-text">Confirmed</span
          >{/if}
      </div>{/if}{/if}<span class={`visibility ${video.visibility}`}
    >{video.visibility}</span
  >{#if video.scheduledAt}<p class="help">{video.scheduledAt}</p>{/if}
</aside>
