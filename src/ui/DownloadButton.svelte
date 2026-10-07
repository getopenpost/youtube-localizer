<script lang="ts">
  import { type Snippet } from 'svelte';
  import { Button, ThemeIcon } from '@openpost/ui';

  import Notice from './Notice.svelte';
  let {
    blob,
    name,
    children,
  }: {
    blob: () => Promise<Blob>;
    name: string;
    children: Snippet;
  } = $props();
  let busy = $state(false);
  let error = $state('');
  import { download } from './shared';
</script>

<Button
  class="secondary"
  intent="ordinary"
  disabled={busy}
  onclick={() => {
    busy = true;
    error = '';
    void blob()
      .then((value) => download(value, name))
      .catch(
        () =>
          (error =
            'Could not export this file. Retry after checking available storage.'),
      )
      .finally(() => (busy = false));
  }}
  ><ThemeIcon role="download" width={16} height={16}
  ></ThemeIcon>{#if busy}Preparing file…{:else}{@render children()}{/if}</Button
>{#if error}<Notice error>{error}</Notice>{/if}
