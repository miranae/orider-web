import { useEffect, useMemo, useState } from "react";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { logClientError } from "../../services/errorLogger";
import { isPermissionDeniedError } from "../../utils/firebaseErrors";

type SocialProfileItem = {
  userId: string;
  profileImage?: string | null;
};

export function useHydratedSocialProfiles<T extends SocialProfileItem>(
  items: readonly T[],
  context: string,
): T[] {
  const [profileImages, setProfileImages] = useState<Map<string, string>>(new Map());

  const missingUserIds = useMemo(
    () => Array.from(new Set(items.filter((item) => !item.profileImage).map((item) => item.userId))),
    [items],
  );
  const missingUserIdKey = missingUserIds.join("|");

  useEffect(() => {
    let cancelled = false;
    if (missingUserIdKey.length === 0) return;
    const userIds = missingUserIdKey.split("|");

    getPublicUserProfiles(userIds)
      .then((profiles) => {
        if (cancelled) return;
        const next = new Map<string, string>();
        profiles.forEach((profile, userId) => {
          if (profile.photoURL) next.set(userId, profile.photoURL);
        });
        if (next.size > 0) setProfileImages(next);
      })
      .catch((err) => {
        if (isPermissionDeniedError(err)) return;
        logClientError("useHydratedSocialProfiles", err, { context, userCount: missingUserIds.length });
      });

    return () => {
      cancelled = true;
    };
  }, [context, missingUserIdKey]);

  return useMemo(
    () => items.map((item) => {
      if (item.profileImage) return item;
      const profileImage = profileImages.get(item.userId);
      return profileImage ? { ...item, profileImage } : item;
    }),
    [items, profileImages],
  );
}
