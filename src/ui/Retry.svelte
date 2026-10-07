<script lang="ts">
  import { Button, ThemeIcon, CheckboxInput } from '@openpost/ui';
  import { type Component, type Job, type Slot } from '../core/model';

  import { command } from '../platform/messages';

  let {
    job,
    component,
    slot,
    disabled,
    onAction,
  }: {
    job: Job;
    component: Component;
    slot: Slot;
    disabled: boolean;
    onAction: (fn: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let acknowledged = $state(false);
</script>

{#if !['ambiguous', 'error'].includes(slot.generation)}{:else}<div
    class="retry-area"
  >
    {#if slot.generation === 'ambiguous'}<label class="checkbox-label"
        ><CheckboxInput
          checked={acknowledged}
          onchange={(e) => (acknowledged = e.currentTarget.checked)}
          {disabled}
        />I checked the provider dashboard and accept a possible second charge.
      </label>{/if}<Button
      class="secondary"
      intent="ordinary"
      disabled={disabled || (slot.generation === 'ambiguous' && !acknowledged)}
      onclick={() =>
        onAction(() =>
          command({ type: 'retry', jobId: job.id, component, acknowledged }),
        )}
      ><ThemeIcon role="refresh" width={15} height={15}></ThemeIcon>Retry {component ===
      'thumbnail'
        ? 'image'
        : 'text'} generation
    </Button>
  </div>{/if}
