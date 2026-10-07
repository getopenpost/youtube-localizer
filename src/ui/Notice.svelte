<script lang="ts">
  import { type Snippet } from 'svelte';
  import { ThemeIcon } from '@openpost/ui';

  let {
    children,
    error = false,
  }: {
    children: Snippet;
    error?: boolean;
  } = $props();
</script>

<div class={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
  {#if error}<ThemeIcon role="help" width={18} height={18}></ThemeIcon>{/if}
  <div>{@render children?.()}</div>
</div>
