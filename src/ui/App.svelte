<script lang="ts">
  import { Toaster } from '@openpost/ui/components/sonner';
  import Header from './Header.svelte';
  import About from './About.svelte';
  import { Button } from '@openpost/ui';
  import type { Component } from 'svelte';
  let { View, page }: { View: Component; page: string } = $props();
</script>

<svelte:boundary>
  <div class={`app-shell ${page}`}>
    <Header {page} />
    <View />
    <About />
    <Toaster theme="system" position="bottom-right" closeButton />
  </div>
  {#snippet failed()}
    <main class="empty-state">
      <h1>Could not open the workspace</h1>
      <p>
        Your local work has not been deleted. Reload the extension to try again.
      </p>
      <Button intent="focal" onclick={() => location.reload()}
        >Reload workspace</Button
      >
    </main>
  {/snippet}
</svelte:boundary>
