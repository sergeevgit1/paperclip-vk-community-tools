import { validateExternalFetchUrl } from "../security.js";
import type { VkCaller, VkPluginConfig } from "../types.js";

function groupId(config: VkPluginConfig): number {
  return Math.abs(config.groupId);
}

export async function vkMediaUploadPhoto(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (typeof params.url !== "string") throw new Error("url is required");
  const validation = validateExternalFetchUrl(params.url);
  if (!validation.valid) throw new Error(`Media fetch aborted: ${validation.reason}`);

  const server = await client.call<any>("photos.getWallUploadServer", { group_id: groupId(config) }, "user");
  const uploadUrl = server?.upload_url;
  if (!uploadUrl) throw new Error("VK did not return upload_url for wall photo");

  if (typeof client.fetchPublicBlob !== "function" || typeof client.uploadFile !== "function") {
    throw new Error("Client does not support binary media transport");
  }

  const blob = await client.fetchPublicBlob(params.url);
  const uploadResult: any = await client.uploadFile(uploadUrl, "photo", blob, "photo.jpg");
  const saved = await client.call<any[]>(
    "photos.saveWallPhoto",
    {
      group_id: groupId(config),
      photo: uploadResult.photo,
      server: uploadResult.server,
      hash: uploadResult.hash,
      caption: params.caption,
    },
    "user",
  );

  const item = Array.isArray(saved) ? saved[0] : saved;
  const owner = item.owner_id ?? -groupId(config);
  return { descriptor: `photo${owner}_${item.id}`, photo: item };
}

export async function vkMediaUploadDocument(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (typeof params.url !== "string" || !params.title) throw new Error("url and title are required");
  const validation = validateExternalFetchUrl(params.url);
  if (!validation.valid) throw new Error(`Media fetch aborted: ${validation.reason}`);

  const server = await client.call<any>("docs.getWallUploadServer", { group_id: groupId(config) }, "user");
  const uploadUrl = server?.upload_url;
  if (!uploadUrl) throw new Error("VK did not return upload_url for wall document");

  if (typeof client.fetchPublicBlob !== "function" || typeof client.uploadFile !== "function") {
    throw new Error("Client does not support binary media transport");
  }

  const blob = await client.fetchPublicBlob(params.url);
  const uploadResult: any = await client.uploadFile(uploadUrl, "file", blob, params.title);
  const saved = await client.call<any>("docs.save", { file: uploadResult.file, title: params.title, tags: params.tags }, "user");
  const item = saved?.doc ?? (Array.isArray(saved) ? saved[0] : saved);
  const owner = item.owner_id ?? -groupId(config);
  return { descriptor: `doc${owner}_${item.id}`, doc: item };
}

export async function vkMediaUploadVideo(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (typeof params.name !== "string" || !params.name.trim()) throw new Error("name is required");
  const saved = await client.call<any>(
    "video.save",
    {
      group_id: groupId(config),
      name: params.name,
      description: params.description,
      is_private: params.isPrivate ? 1 : 0,
      wallpost: params.wallpost ? 1 : 0,
    },
    "user",
  );
  return {
    uploadUrl: saved.upload_url,
    videoId: saved.video_id,
    ownerId: saved.owner_id,
    descriptor: `video${saved.owner_id}_${saved.video_id}`,
  };
}

export async function vkMediaCreatePoll(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (typeof params.question !== "string" || !Array.isArray(params.answers) || params.answers.length < 2) {
    throw new Error("question and at least 2 answers are required");
  }
  const poll = await client.call<any>(
    "polls.create",
    {
      owner_id: -groupId(config),
      question: params.question,
      answers: JSON.stringify(params.answers),
      is_anonymous: params.isAnonymous ? 1 : 0,
      is_multiple: params.isMultiple ? 1 : 0,
      end_date: params.endDate,
    },
    "user",
  );
  return {
    pollId: poll.id,
    ownerId: poll.owner_id,
    descriptor: `poll${poll.owner_id}_${poll.id}`,
    poll,
  };
}
