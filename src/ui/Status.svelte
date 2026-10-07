<script lang="ts">
  import { ThemeIcon } from '@openpost/ui';

  import type { Slot } from '../core/model';
  let { slot }: { slot: Slot } = $props();
  import { slotLabel } from './shared';
</script>

<span
  class={`status ${['verified', 'preserved', 'approved'].includes(slot.application) ? 'success' : ''} ${slot.application === 'stale' || slot.application === 'needs-verification' || ['ambiguous', 'error'].includes(slot.generation) ? 'attention' : ''}`}
  >{#if ['verified', 'approved'].includes(slot.application)}<ThemeIcon
      role="check"
      width={13}
      height={13}
    ></ThemeIcon>{/if}
  {slotLabel(slot)}</span
>
