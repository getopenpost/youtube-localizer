<script lang="ts">
  import { Button, Textarea, CheckboxInput } from '@openpost/ui';
  import { type Job, type Slot } from '../core/model';
  import { languageName } from '../core/languages';

  import { command } from '../platform/messages';

  import Status from './Status.svelte';
  let {
    job,
    component,
    slot,
    disabled,
    onAction,
  }: {
    job: Job;
    component: 'title' | 'description';
    slot: Slot;
    disabled: boolean;
    onAction: (fn: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let optimisticApproval = $state<boolean>();
  let approved = $derived(
    optimisticApproval ?? slot.application === 'approved',
  );
  let draft = $state<string>();
  const value = $derived(draft ?? slot.value ?? '');
  const editable = $derived(
    slot.generation === 'generated' &&
      !['verified', 'preserved', 'stale'].includes(slot.application),
  );
</script>

<section class="review-component">
  <div class="component-heading">
    <h3>{component === 'title' ? 'Title' : 'Description'}</h3>
    <Status {slot}></Status>
  </div>
  {#if editable}<label class="sr-only" for={`${job.id}/${component}`}
      >{languageName(job.language)} {component}</label
    ><Textarea
      id={`${job.id}/${component}`}
      rows={component === 'title' ? 2 : 5}
      {value}
      maxlength={component === 'title' ? 100 : 5000}
      dir="auto"
      {disabled}
      oninput={(e) => (draft = e.currentTarget.value)}
    ></Textarea>
    <div class="field-actions">
      {#if draft !== undefined}<span
          >{value.length}/{component === 'title' ? 100 : 5000}</span
        >{/if}{#if draft !== undefined && draft !== slot.value}<Button
          class="text-button"
          intent="quiet"
          disabled={disabled || draft === undefined || draft === slot.value}
          onclick={() =>
            onAction(async () => {
              await command({
                type: 'edit',
                jobId: job.id,
                component,
                value,
              });
              draft = undefined;
            })}
          >Save wording
        </Button>{/if}<label class="checkbox-label"
        ><CheckboxInput
          disabled={disabled ||
            (draft !== undefined && draft !== slot.value) ||
            !value.trim()}
          checked={approved}
          onchange={(e) => {
            const checked = e.currentTarget.checked;
            (async () => {
              optimisticApproval = checked;
              await onAction(() =>
                command({
                  type: 'approve',
                  jobId: job.id,
                  component,
                  approved: checked,
                }),
              );
            })().finally(() => {
              optimisticApproval = undefined;
            });
          }}
        />Approved
      </label>
    </div>{:else}{#if slot.application === 'preserved' ? (slot.lastEvidence?.value ?? slot.value) : slot.value}<p
        class="readonly-translation"
        dir="auto"
      >
        {slot.application === 'preserved'
          ? (slot.lastEvidence?.value ?? slot.value)
          : slot.value}
      </p>{:else}<p class="help">
        {slot.application === 'preserved'
          ? 'Studio already has this component. It will be preserved.'
          : slot.generation === 'queued'
            ? 'Generate after checking that this component is missing.'
            : 'No generated text yet.'}
      </p>{/if}{/if}{#if slot.error}<p class="component-error">
      {slot.error}
    </p>{/if}{#if slot.application === 'stale' && slot.lastEvidence?.state === 'missing'}<Button
      class="secondary"
      intent="ordinary"
      {disabled}
      onclick={() =>
        onAction(() =>
          command({ type: 'regenerate-text', jobId: job.id, component }),
        )}
      >Queue from the updated source
    </Button>{/if}
</section>
