import { ok, publicRoute, readQuery } from "@/lib/http";
import * as storageService from "@/services/storage.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const [folders, files] = await Promise.all([
    storageService.listResourceFolders({ publicOnly: true }),
    storageService.listResourceFiles({
      publicOnly: true,
      folderId: query.folderId,
      fileType: query.fileType,
      search: query.search,
    }),
  ]);
  return ok({ folders, files });
});

