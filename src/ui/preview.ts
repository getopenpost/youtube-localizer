import { hash, preferencesSchema, type Job, type Video } from '../core/model';
import { repository } from '../core/storage';
export async function seedPreview() {
  if ((await repository.videos()).length) return;
  const channelId = 'UC0000000000000000000000';
  const video: Video = {
    id: 'preview0001',
    channelId,
    channelName: 'Illustrative preview channel',
    title: 'Uma aula de cada vez',
    description:
      'Uma introdução prática para quem quer aprender ao seu ritmo.\n\n00:00 Introdução\n02:10 A primeira ideia\n08:30 Exercícios',
    sourceLanguage: 'pt',
    visibility: 'scheduled',
    scheduledAt: 'Oct 12, 2026, 18:00',
    thumbnailText: ['APRENDE AO TEU RITMO'],
    thumbnailTextApproved: true,
    checkedAt: Date.now(),
  };
  video.sourceHashes = {
    title: await hash(video.title),
    description: await hash(video.description),
    thumbnail: await hash('preview'),
  };
  await repository.putVideo(video);
  await repository.putPreferences(
    preferencesSchema.parse({
      channelId,
      targetLanguages: ['en', 'fr'],
      components: ['title', 'description', 'thumbnail'],
    }),
  );
  const examples = [
    {
      language: 'en',
      title: 'One lesson at a time',
      description:
        'A practical introduction for anyone who wants to learn at their own pace.\n\n00:00 Introduction\n02:10 The first idea\n08:30 Exercises',
      wording: 'LEARN AT YOUR OWN PACE',
    },
    {
      language: 'fr',
      title: 'Une leçon à la fois',
      description:
        'Une introduction pratique pour apprendre à votre rythme.\n\n00:00 Introduction\n02:10 La première idée\n08:30 Exercices',
      wording: 'APPRENEZ À VOTRE RYTHME',
    },
  ];
  for (const example of examples) {
    const job: Job = {
      id: `${channelId}/${video.id}/${example.language}`,
      channelId,
      videoId: video.id,
      language: example.language,
      sourceLanguage: 'pt',
      source: video,
      glossary: '',
      slots: {
        title: {
          sourceHash: video.sourceHashes.title,
          generation: 'generated',
          application: 'pending',
          value: example.title,
          lastEvidence: { state: 'missing' },
        },
        description: {
          sourceHash: video.sourceHashes.description,
          generation: 'generated',
          application: 'pending',
          value: example.description,
          lastEvidence: { state: 'missing' },
        },
        thumbnail: {
          sourceHash: video.sourceHashes.thumbnail,
          generation: 'queued',
          application: 'pending',
          lastEvidence: { state: 'missing' },
        },
      },
      thumbnailStrings: [example.wording],
      wordingApproved: false,
      correction: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await repository.putJob(job);
  }
}
