import { useEffect, useMemo, useState } from "react";
import { getPublicUserAvatarProfiles } from "../../services/publicProfiles";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { isPermissionDeniedError } from "../../utils/firebaseErrors";

type SocialProfileItem = {
  userId: string;
  profileImage?: string | null;
};

export function useHydratedSocialProfiles<T extends SocialProfileItem>(
  items: readonly T[],
  context: string,
): T[] {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const { firestore } = services;
  const authScope = services.auth ?? services;
  const viewer = user ?? null;
  const [hydrated, setHydrated] = useState<{ database: typeof firestore; authScope: object; viewer: typeof viewer; images: Map<string, string> } | null>(null);
  const profileImages = hydrated?.database === firestore && hydrated.authScope === authScope && hydrated.viewer === viewer ? hydrated.images : null;

  const missingUserIds = useMemo(
    () => Array.from(new Set(items.filter((item) => !item.profileImage).map((item) => item.userId))),
    [items],
  );
  const missingUserIdKey = JSON.stringify(missingUserIds);

  useEffect(() => {
    let cancelled = false;
    const userIds = JSON.parse(missingUserIdKey) as string[];
    if (userIds.length === 0) return;

    getPublicUserAvatarProfiles(userIds, firestore, authScope, viewer)
      .then((profiles) => {
        if (cancelled) return;
        const next = new Map<string, string>();
        profiles.forEach((profile, userId) => {
          if (profile.photoURL) next.set(userId, profile.photoURL);
        });
        setHydrated({ database: firestore, authScope, viewer, images: next });
      })
      .catch((err) => {
        if (isPermissionDeniedError(err)) return;
        logClientError("useHydratedSocialProfiles", err, { context, userCount: userIds.length });
      });

    return () => {
      cancelled = true;
    };
  }, [context, missingUserIdKey, firestore, authScope, viewer]);

  return useMemo(
    () => items.map((item) => {
      if (item.profileImage) return item;
      const profileImage = profileImages?.get(item.userId);
      return profileImage ? { ...item, profileImage } : item;
    }),
    [items, profileImages],
  );
}
