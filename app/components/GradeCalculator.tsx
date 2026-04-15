"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import styles from "./GradeCalculator.module.css";
import { supabase } from "@/lib/supabase/client";
import Auth from "./Auth";
import type { User } from "@supabase/supabase-js";

interface Assignment {
  id: string;
  score: string;
  total: string;
}

interface Category {
  id: string;
  name: string;
  weight: string;
  assignments: Assignment[];
}

interface Course {
  id: string;
  name: string;
  categories: Category[];
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function emptyAssignment(): Assignment {
  return { id: uid(), score: "", total: "100" };
}

function emptyCategory(name = "", weight = ""): Category {
  return { id: uid(), name, weight, assignments: [emptyAssignment()] };
}

function defaultCategories(): Category[] {
  return [
    emptyCategory("midterm 1", "20"),
    emptyCategory("midterm 2", "20"),
    emptyCategory("homework", "10"),
    emptyCategory("lab", "10"),
    emptyCategory("final", "40"),
  ];
}

function emptyCourse(name = ""): Course {
  return { id: uid(), name, categories: defaultCategories() };
}

function calcCategory(assignments: Assignment[]): number | null {
  const valid = assignments.filter(
    (a) =>
      a.score !== "" &&
      a.total !== "" &&
      !isNaN(+a.score) &&
      !isNaN(+a.total) &&
      +a.total > 0
  );
  if (valid.length === 0) return null;
  const avg = valid.reduce((s, a) => s + (+a.score / +a.total) * 100, 0) / valid.length;
  return avg;
}

function calcCourse(categories: Category[]): number | null {
  const graded = categories.filter(
    (c) =>
      c.weight !== "" &&
      !isNaN(+c.weight) &&
      +c.weight > 0 &&
      calcCategory(c.assignments) !== null
  );
  if (graded.length === 0) return null;

  const totalWeight = graded.reduce((s, c) => s + +c.weight, 0);
  const weighted = graded.reduce((s, c) => {
    const g = calcCategory(c.assignments)!;
    return s + g * (+c.weight / totalWeight);
  }, 0);
  return weighted;
}

function letterGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 63) return "D";
  if (pct >= 60) return "D-";
  return "F";
}

function gradeColor(pct: number): string {
  if (pct >= 90) return "var(--green)";
  if (pct >= 80) return "var(--blue)";
  if (pct >= 70) return "var(--yellow)";
  return "var(--red)";
}

export default function GradeCalculator() {
  const [courses, setCourses] = useState<Course[]>([emptyCourse("CS104")]);
  const [activeCourse, setActiveCourse] = useState(0);
  const [weightsTouched, setWeightsTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "">("");
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  async function saveAll(data: Course[]) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;
    setSaveStatus("saving");
    try {
      // upsert all courses
      const { error: ce } = await supabase.from("courses").upsert(
        data.map((c, ci) => ({ id: c.id, name: c.name, position: ci, user_id: userId }))
      );
      if (ce) throw ce;

      // upsert all categories
      const allCats = data.flatMap((c, ci) =>
        c.categories.map((cat, cati) => ({ id: cat.id, course_id: c.id, name: cat.name, weight: cat.weight, position: cati }))
      );
      if (allCats.length) {
        const { error: cate } = await supabase.from("categories").upsert(allCats);
        if (cate) throw cate;
      }

      // upsert all assignments
      const allAsgs = data.flatMap((c) =>
        c.categories.flatMap((cat) =>
          cat.assignments.map((a, ai) => ({ id: a.id, category_id: cat.id, score: a.score, total: a.total, position: ai }))
        )
      );
      if (allAsgs.length) {
        const { error: ae } = await supabase.from("assignments").upsert(allAsgs);
        if (ae) throw ae;
      }

      // delete removed rows
      const courseIds = data.map((c) => c.id);
      const catIds = data.flatMap((c) => c.categories.map((cat) => cat.id));
      const asgIds = data.flatMap((c) => c.categories.flatMap((cat) => cat.assignments.map((a) => a.id)));

      await supabase.from("courses").delete().not("id", "in", `(${courseIds.join(",")})`);
      if (catIds.length) await supabase.from("categories").delete().not("id", "in", `(${catIds.join(",")})`);
      if (asgIds.length) await supabase.from("assignments").delete().not("id", "in", `(${asgIds.join(",")})`);

      setSaveStatus("saved");
    } catch (err) {
      console.error("save failed:", err);
      setSaveStatus("");
    }
  }

  async function loadData() {
    const { data: courseRows } = await supabase.from("courses").select("*").order("position");
    if (!courseRows || courseRows.length === 0) { setLoading(false); return; }

    const { data: catRows } = await supabase.from("categories").select("*").order("position");
    const { data: asgRows } = await supabase.from("assignments").select("*").order("position");

    const loaded: Course[] = courseRows.map((c) => ({
      id: c.id,
      name: c.name,
      categories: (catRows ?? [])
        .filter((cat) => cat.course_id === c.id)
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          weight: cat.weight,
          assignments: (asgRows ?? [])
            .filter((a) => a.category_id === cat.id)
            .map((a) => ({ id: a.id, score: a.score, total: a.total })),
        })),
    }));

    setCourses(loaded);
    setLoading(false);
  }

  // listen to auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadData();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true);
        loadData();
      } else {
        setCourses([emptyCourse("CS104")]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // auto-save with debounce (only when logged in)
  useEffect(() => {
    if (loading || !user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAll(courses), 300);
  }, [courses, loading, user]);

  // save on tab close
  useEffect(() => {
    function handleUnload() { saveAll(coursesRef.current); }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const course = courses[activeCourse];

  function updateCourse(id: string, patch: Partial<Course>) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function updateCategory(courseId: string, catId: string, patch: Partial<Category>) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              categories: c.categories.map((cat) =>
                cat.id === catId ? { ...cat, ...patch } : cat
              ),
            }
          : c
      )
    );
  }

  function addCategory(courseId: string) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? { ...c, categories: [...c.categories, emptyCategory()] }
          : c
      )
    );
  }

  function removeCategory(courseId: string, catId: string) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? { ...c, categories: c.categories.filter((cat) => cat.id !== catId) }
          : c
      )
    );
  }

  function updateAssignment(
    courseId: string,
    catId: string,
    aId: string,
    patch: Partial<Assignment>
  ) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              categories: c.categories.map((cat) =>
                cat.id === catId
                  ? {
                      ...cat,
                      assignments: cat.assignments.map((a) =>
                        a.id === aId ? { ...a, ...patch } : a
                      ),
                    }
                  : cat
              ),
            }
          : c
      )
    );
  }

  function addAssignment(courseId: string, catId: string) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              categories: c.categories.map((cat) =>
                cat.id === catId
                  ? { ...cat, assignments: [...cat.assignments, emptyAssignment()] }
                  : cat
              ),
            }
          : c
      )
    );
  }

  function removeAssignment(courseId: string, catId: string, aId: string) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              categories: c.categories.map((cat) =>
                cat.id === catId
                  ? { ...cat, assignments: cat.assignments.filter((a) => a.id !== aId) }
                  : cat
              ),
            }
          : c
      )
    );
  }

  function addCourse() {
    const newCourse = emptyCourse(`course ${courses.length + 1}`);
    setCourses((prev) => [...prev, newCourse]);
    setActiveCourse(courses.length);
  }

  function removeCourse(idx: number) {
    if (courses.length === 1) return;
    const next = courses.filter((_, i) => i !== idx);
    setCourses(next);
    setActiveCourse(Math.min(activeCourse, next.length - 1));
  }

  const courseGrade = useMemo(() => calcCourse(course.categories), [course]);

  const weightTotal = useMemo(() => {
    return course.categories.reduce((s, c) => {
      const w = parseFloat(c.weight);
      return s + (isNaN(w) ? 0 : w);
    }, 0);
  }, [course]);

  const weightError = weightsTouched
    ? weightTotal > 100
      ? `weights add up to ${weightTotal}% — reduce by ${weightTotal - 100}%`
      : weightTotal < 100 && weightTotal > 0
      ? `weights add up to ${weightTotal}% — ${100 - weightTotal}% unaccounted for`
      : null
    : null;

  const overallAvg = useMemo(() => {
    const graded = courses
      .map((c) => calcCourse(c.categories))
      .filter((g) => g !== null) as number[];
    if (graded.length === 0) return null;
    return graded.reduce((s, g) => s + g, 0) / graded.length;
  }, [courses]);

  if (loading) return <div className={styles.loading}>loading...</div>;

  return (
    <div className={styles.shell}>
      {showAuth && <Auth onClose={() => setShowAuth(false)} />}
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <img src="/usc-logo.png" alt="USC" className={styles.uscLogo} />
          <span className={styles.logo}>Grade Calculator</span>
        </div>
        <div className={styles.authArea}>
          {user ? (
            <>
              {saveStatus && (
                <span className={styles.saveStatus}>{saveStatus === "saving" ? "saving..." : "saved"}</span>
              )}
              <span className={styles.userEmail}>{user.email}</span>
              <button className={styles.authBtn} onClick={() => supabase.auth.signOut()}>sign out</button>
            </>
          ) : (
            <>
              <span className={styles.unsavedNote}>not saving — </span>
              <button className={styles.authBtn} onClick={() => setShowAuth(true)}>sign in to save</button>
            </>
          )}
        </div>
      </header>

      {/* course tabs */}
      <div className={styles.tabs}>
        {courses.map((c, i) => {
          const g = calcCourse(c.categories);
          return (
            <button
              key={c.id}
              className={`${styles.tab} ${activeCourse === i ? styles.tabActive : ""}`}
              onClick={() => setActiveCourse(i)}
            >
              <span className={styles.tabName}>{c.name || `course ${i + 1}`}</span>
              {g !== null && (
                <span className={styles.tabGrade} style={{ color: gradeColor(g) }}>
                  {g.toFixed(0)}%
                </span>
              )}
              {courses.length > 1 && (
                <span
                  className={styles.tabClose}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCourse(i);
                  }}
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
        <button className={styles.addCourseBtn} onClick={addCourse}>
          + course
        </button>
      </div>

      {/* active course */}
      <div className={styles.body}>
        {weightError && (
          <div className={styles.weightError}>{weightError}</div>
        )}
        <div className={styles.courseHeader}>
          <input
            className={styles.courseName}
            value={course.name}
            placeholder="course name"
            onChange={(e) => updateCourse(course.id, { name: e.target.value })}
            onBlur={() => setTimeout(() => saveAll(coursesRef.current), 50)}
          />
          {courseGrade !== null && (
            <div className={styles.courseGrade}>
              <span className={styles.overallGradeLabel}>overall grade</span>
              <span style={{ color: gradeColor(courseGrade) }}>
                {courseGrade.toFixed(2)}%
              </span>
              <span
                className={styles.letterBadge}
                style={{
                  color: gradeColor(courseGrade),
                  borderColor: gradeColor(courseGrade),
                }}
              >
                {letterGrade(courseGrade)}
              </span>
            </div>
          )}
        </div>

        {/* categories */}
        {course.categories.map((cat) => {
          const catGrade = calcCategory(cat.assignments);
          return (
            <div key={cat.id} className={styles.categorySection}>
              <div className={styles.categoryHeader}>
                <input
                  className={styles.categoryName}
                  value={cat.name}
                  placeholder="category name"
                  onChange={(e) =>
                    updateCategory(course.id, cat.id, { name: e.target.value })
                  }
                />
                <div className={styles.categoryMeta}>
                  <label className={styles.weightLabel}>weight</label>
                  <input
                    className={styles.weightInput}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={cat.weight}
                    onChange={(e) => {
                      updateCategory(course.id, cat.id, { weight: e.target.value });
                      setWeightsTouched(true);
                    }}
                  />
                  <span className={styles.weightPct}>%</span>
                  {catGrade !== null && (
                    <span
                      className={styles.categoryGrade}
                      style={{ color: gradeColor(catGrade) }}
                    >
                      {catGrade.toFixed(1)}%
                    </span>
                  )}
                  {course.categories.length > 1 && (
                    <button
                      className={styles.delCategoryBtn}
                      onClick={() => removeCategory(course.id, cat.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* assignment rows */}
              <div className={styles.assignmentList}>
                <div className={styles.colHeaders}>
                  <span className={styles.colNum}>score</span>
                  <span className={styles.colNum}>out of</span>
                  <span className={styles.colPct}>grade</span>
                  <span className={styles.colDel} />
                </div>

                {cat.assignments.map((a) => {
                  const pct =
                    a.score !== "" && a.total !== "" && +a.total > 0
                      ? (+a.score / +a.total) * 100
                      : null;
                  return (
                    <div key={a.id} className={styles.row}>
                      <input
                        className={`${styles.cell} ${styles.cellNum}`}
                        placeholder="—"
                        value={a.score}
                        type="number"
                        min="0"
                        onChange={(e) =>
                          updateAssignment(course.id, cat.id, a.id, { score: e.target.value })
                        }
                        onBlur={() => setTimeout(() => saveAll(coursesRef.current), 50)}
                      />
                      <input
                        className={`${styles.cell} ${styles.cellNum}`}
                        placeholder="100"
                        value={a.total}
                        type="number"
                        min="1"
                        onChange={(e) =>
                          updateAssignment(course.id, cat.id, a.id, { total: e.target.value })
                        }
                        onBlur={() => setTimeout(() => saveAll(coursesRef.current), 50)}
                      />
                      <span
                        className={styles.pct}
                        style={{ color: pct !== null ? gradeColor(pct) : "var(--text-muted)" }}
                      >
                        {pct !== null ? `${pct.toFixed(1)}%` : "—"}
                      </span>
                      <button
                        className={styles.delBtn}
                        onClick={() => removeAssignment(course.id, cat.id, a.id)}
                        disabled={cat.assignments.length === 1}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                <button
                  className={styles.addRowBtn}
                  onClick={() => addAssignment(course.id, cat.id)}
                >
                  + add assignment
                </button>
              </div>
            </div>
          );
        })}

        <button className={styles.addCategoryBtn} onClick={() => addCategory(course.id)}>
          + add category
        </button>
      </div>
    </div>
  );
}
