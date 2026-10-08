<script lang="ts">
  import { Button, Textarea, ThemeIcon, CheckboxInput } from '@openpost/ui';
  import { type Job, type Slot } from '../core/model';
  import { languageName } from '../core/languages';
  import { repository } from '../core/storage';

  import { command } from '../platform/messages';

  import { download } from './shared';
  import AssetImage from './AssetImage.svelte';

  import Status from './Status.svelte';
  import WordingReview from './WordingReview.svelte';
  let {
    job,
    slot,
    disabled,
    onAction,
    onDirty,
    local,
    authuser,
  }: {
    job: Job;
    local: boolean;
    authuser?: string;
    slot: Slot;
    disabled: boolean;
    onDirty?: (id: string, dirty: boolean) => void;
    onAction: (fn: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let optimisticApproval = $state<boolean>();
  let approved = $derived(
    optimisticApproval ?? slot.application === 'approved',
  );
  let correction = $state('');
</script>

<section class="review-component">
  <div class="component-heading">
    <h3>Thumbnail</h3>
    <Status {slot}></Status>
  </div>
  {#key `${job.id}:${job.source.thumbnailText?.join('|')}`}<WordingReview
      {job}
      {disabled}
      {onAction}
      {onDirty}
    ></WordingReview>{/key}{#if slot.assetId}<AssetImage
      assetId={slot.assetId}
      alt={`${languageName(job.language)} generated thumbnail`}
      class="review-thumbnail"
    ></AssetImage>{/if}{#if slot.generation === 'generated'}<div
      class="field-actions"
    >
      <Button
        class="text-button"
        intent="quiet"
        onclick={() =>
          onAction(async () => {
            const asset = await repository.asset(slot.assetId!);
            if (asset)
              download(asset.blob, `${job.videoId}-${job.language}.jpg`);
          })}
        ><ThemeIcon role="download" width={15} height={15}></ThemeIcon>Download
        image
      </Button><label class="checkbox-label"
        ><CheckboxInput
          disabled={disabled ||
            ['stale', 'preserved', 'verified'].includes(slot.application) ||
            slot.lastEvidence?.state !== 'missing'}
          checked={approved}
          onchange={(e) => {
            const checked = e.currentTarget.checked;
            (async () => {
              optimisticApproval = checked;
              await onAction(() =>
                command({
                  type: 'approve',
                  jobId: job.id,
                  component: 'thumbnail',
                  approved: checked,
                }),
              );
            })().finally(() => {
              optimisticApproval = undefined;
            });
          }}
        />Approved
      </label>
    </div>
    <details class="regenerate">
      <summary
        >{local
          ? 'Render updated thumbnail'
          : 'Regenerate this thumbnail'}</summary
      >{#if !local}<label
          >Correction instruction <Textarea
            rows={2}
            value={correction}
            oninput={(e) => (correction = e.currentTarget.value)}
            placeholder="For example: keep the face unchanged and make the headline shorter"
          ></Textarea></label
        >{/if}<Button
        class="secondary"
        intent="ordinary"
        {disabled}
        onclick={() =>
          onAction(() =>
            command({
              type: 'regenerate-image',
              jobId: job.id,
              correction,
            }),
          )}
        ><ThemeIcon role="refresh" width={15} height={15}></ThemeIcon>{local
          ? 'Queue local render'
          : 'Queue a new edit'}</Button
      >
    </details>{/if}{#if slot.error}<p class="component-error">
      {slot.error}
    </p>{/if}{#if slot.application === 'needs-verification'}<a
      class="text-button"
      href={`https://studio.youtube.com/video/${job.videoId}/translations${authuser === undefined ? '' : `?authuser=${encodeURIComponent(authuser)}`}`}
      target="_blank"
      rel="noreferrer"
      >Verify in Studio <ThemeIcon role="external-link" width={14} height={14}
      ></ThemeIcon></a
    >{/if}
</section>
