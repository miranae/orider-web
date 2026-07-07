import { useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  onSnapshot,
} from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import {
  replaceCourseSnapshotDocs,
  type CourseData,
  type LatLngTuple,
} from "./courseSnapshot";
import { isVisibleCourseDocData } from "./courseVisibility";

export function useCourseCatalog() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const polylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());
  const polylineValueCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const coursesQuery = query(
      collection(firestore, "courses"),
    );

    const unsubscribe = onSnapshot(coursesQuery, (snapshot) => {
      const docs = snapshot.docs
        .map((doc) => ({ id: doc.id, data: doc.data() }))
        .filter((item) => isVisibleCourseDocData(item.data));
      setCourses(replaceCourseSnapshotDocs(docs, polylineCache.current, polylineValueCache.current));
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
