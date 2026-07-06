import { useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import {
  replaceCourseSnapshotDocs,
  type CourseData,
  type LatLngTuple,
} from "./courseSnapshot";

export function useCourseCatalog() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const polylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());

  useEffect(() => {
    const coursesQuery = query(
      collection(firestore, "courses"),
      where("deletedAt", "==", null),
    );

    const unsubscribe = onSnapshot(coursesQuery, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      }));
      setCourses(replaceCourseSnapshotDocs(docs, polylineCache.current));
      setLoading(false);
    }, (err) => {
      logClientError("CoursesPage.courseSubscription", err);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return {
    courses,
    loading,
    polylineCache,
  };
}
