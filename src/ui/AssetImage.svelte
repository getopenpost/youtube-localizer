<script lang="ts">
  import { untrack } from 'svelte';
  import { ThemeIcon } from '@openpost/ui';
  import { repository } from '../core/storage';

  let {
    assetId,
    previewUrl,
    alt,
    class: className = '',
  }: {
    assetId?: string;
    previewUrl?: string;
    alt: string;
    class?: string;
  } = $props();
  let failedPreview = $state('');
  const studioPreview = $derived.by(() => {
    if (!previewUrl) return undefined;
    try {
      const parsed = new URL(previewUrl);
      if (
        parsed.protocol === 'https:' &&
        !parsed.username &&
        !parsed.password &&
        parsed.hostname.endsWith('.ytimg.com')
      )
        return parsed.href;
    } catch {
      /* Ignore unreadable Studio URLs. */
    }
    return undefined;
  });
  let image = $state<{ assetId: string; url: string }>();
  $effect(() => {
    void assetId;
    return untrack(() => {
      let alive = true;
      let objectUrl = '';
      if (assetId)
        void repository
          .asset(assetId)
          .then((asset) => {
            if (asset && alive) {
              objectUrl = URL.createObjectURL(asset.blob);
              image = { assetId, url: objectUrl };
            }
          })
          .catch(() => {});
      return () => {
        alive = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    });
  });
  const url = $derived(
    (image?.assetId === assetId ? image?.url : undefined) ??
      (failedPreview !== studioPreview ? studioPreview : undefined),
  );
</script>

{#if url}<img
    src={url}
    {alt}
    class={className}
    loading="lazy"
    decoding="async"
    onerror={() => {
      if (url === studioPreview) failedPreview = studioPreview ?? '';
      else image = undefined;
    }}
  />{:else}<div class={`image-placeholder ${className}`}>
    <ThemeIcon role="language" width={24} height={24}></ThemeIcon><span
      >Thumbnail not cached</span
    >
  </div>{/if}
