<script lang="ts">
  import { Button, ThemeIcon } from '@openpost/ui';

  let { page }: { page: string } = $props();
  import { openPage } from './shared';
</script>

<header class="app-header">
  <a class="brand" href="sidepanel.html" aria-label="YouTube Localizer home"
    ><span class="brand-mark"
      ><ThemeIcon role="language" width={22} height={22} stroke-width={1.8}
      ></ThemeIcon></span
    ><span>YouTube Localizer<small>by OpenPost</small></span></a
  >
  <nav aria-label="Workspace">
    <Button
      class="icon-button"
      intent="quiet"
      size="icon"
      aria-label="Generate thumbnails"
      title="Thumbnails"
      aria-current={page === 'thumbnail' ? 'page' : undefined}
      onclick={() => openPage('thumbnail')}
      ><ThemeIcon role="image-add" width={19} height={19}></ThemeIcon></Button
    ><Button
      class="icon-button"
      intent="quiet"
      size="icon"
      title="Review workspace"
      aria-label="Open review workspace"
      aria-current={page === 'review' ? 'page' : undefined}
      onclick={() => openPage('review')}
      ><ThemeIcon role="layout" width={19} height={19}></ThemeIcon></Button
    ><Button
      class="icon-button"
      intent="quiet"
      size="icon"
      title="Settings"
      aria-label="Open settings"
      aria-current={page === 'options' ? 'page' : undefined}
      onclick={() => openPage('options')}
      ><ThemeIcon role="settings" width={19} height={19}></ThemeIcon></Button
    >
  </nav>
</header>
