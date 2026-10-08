<script lang="ts">
  import { Input, CheckboxInput } from '@openpost/ui';
  import { type Job } from '../core/model';
  import { languageName } from '../core/languages';

  import { command } from '../platform/messages';

  let {
    job,
    disabled,
    onAction,
    onDirty,
  }: {
    job: Job;
    disabled: boolean;
    onDirty?: (id: string, dirty: boolean) => void;
    onAction: (fn: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let pendingApproval = $state<boolean>();
  let draft = $state<string[]>();
  const strings = $derived(
    draft ??
      job.thumbnailStrings ??
      job.source.thumbnailText?.map(() => '') ??
      [],
  );
  $effect(() => {
    onDirty?.(
      `${job.id}/wording`,
      draft !== undefined &&
        JSON.stringify(draft) !== JSON.stringify(job.thumbnailStrings),
    );
  });
</script>

{#if !job.source.thumbnailTextApproved}{:else}{#if !job.source.thumbnailText?.length}{:else}<div
      class="wording-review"
    >
      <h4>Exact thumbnail wording</h4>
      {#each job.source.thumbnailText as source, i (i)}<label
          ><span dir="auto">{source}</span><Input
            aria-label={`${languageName(job.language)} thumbnail text ${i + 1}`}
            dir="auto"
            value={strings[i] ?? ''}
            disabled={disabled ||
              ['waiting', 'submitting'].includes(
                job.slots.thumbnail?.generation ?? '',
              )}
            oninput={(e) => {
              const next = [...strings];
              next[i] = e.currentTarget.value;
              draft = next;
            }}
          ></Input></label
        >{/each}<label class="checkbox-label"
        ><CheckboxInput
          disabled={disabled ||
            strings.some((s) => !s.trim()) ||
            ['waiting', 'submitting'].includes(
              job.slots.thumbnail?.generation ?? '',
            )}
          checked={pendingApproval ??
            (job.wordingApproved && draft === undefined)}
          onchange={(e) => {
            const checked = e.currentTarget.checked;
            pendingApproval = checked;
            void onAction(async () => {
              await command({
                type: 'wording',
                jobId: job.id,
                strings,
                approved: checked,
              });
              draft = undefined;
            }).finally(() => (pendingApproval = undefined));
          }}
        />Use these exact words in the image
      </label>
    </div>{/if}{/if}
