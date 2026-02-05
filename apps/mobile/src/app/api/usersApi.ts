// apps/mobile/src/app/api/usersApi.ts

// Back-compat shim: keep old import path working.
// Prefer importing `userApi` from "../api/userApi" going forward.

export { userApi as usersApi } from "./userApi";

export type {
  UserMeDTO as MeResponseDTO,
  PatchUserMeRequestDTO as PatchMeRequestDTO,
} from "@pq/shared/user/types";

