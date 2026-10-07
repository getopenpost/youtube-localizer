<script lang="ts">
  import { untrack } from 'svelte';
  import { ThemeIcon } from '@openpost/ui';
  import { repository } from '../core/storage';

  let {
    assetId,
    alt,
    class: className = '',
  }: {
    assetId?: string;
    alt: string;
    class?: string;
  } = $props();
  let image = $state<{ assetId: string; url: string }>();
  $effect(() => {
    void assetId;
    return untrack(() => {
      let alive = true;
      let objectUrl = '';
      if (assetId)
        void repository.asset(assetId).then((asset) => {
          if (asset && alive) {
            objectUrl = URL.createObjectURL(asset.blob);
            image = { assetId, url: objectUrl };
          }
        });
      return () => {
        alive = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    });
  });
  const url = $derived(image?.assetId === assetId ? image?.url : undefined);
</script>

{#if url}<img src={url} {alt} class={className} />{:else}<div
    class={`image-placeholder ${className}`}
  >
    <ThemeIcon role="language" width={24} height={24}></ThemeIcon><span
      >Thumbnail not cached</span
    >
  </div>{/if}
