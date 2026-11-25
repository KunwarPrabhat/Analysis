#!/usr/bin/env python3
"""Build presentation/data.js from up to 3 monitoring sessions in results/."""
import csv
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_DIR = os.path.join(ROOT, "results")
OUT_PATH = os.path.join(ROOT, "presentation", "data.js")


def num_or_none(v):
    if v is None or v == "" or v == "NA" or v == "NaN":
        return None
    try:
        if "." in v:
            return round(float(v), 3)
        return int(v)
    except ValueError:
        return v


def load_csv(sess_dir, name, cols, max_elapsed_ms=None):
    path = os.path.join(sess_dir, name)
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            item = {c: num_or_none(row.get(c)) for c in cols}
            if max_elapsed_ms is not None and isinstance(item.get("elapsed_ms"), (int, float)):
                if item["elapsed_ms"] > max_elapsed_ms:
                    continue
            rows.append(item)
    return rows


def load_session(sess_dir, max_elapsed_ms=None):
    meta_path = os.path.join(sess_dir, "metadata.json")
    if not os.path.exists(meta_path):
        return None
    with open(meta_path) as f:
        metadata = json.load(f)

    return {
        "metadata": metadata,
        "summary": load_csv(sess_dir, "summary.csv", [
            "source_file", "metric_name", "min", "max", "mean", "median",
            "stddev", "p95", "p99", "first_valid", "last_valid", "net_change",
            "valid_count", "missing_count"
        ]),
        "memory": load_csv(sess_dir, "memory.csv", [
            "elapsed_ms", "total_pss_kib", "total_rss_kib", "private_dirty_kib", "private_clean_kib",
            "swap_pss_kib", "native_heap_pss_kib", "java_heap_pss_kib", "graphics_pss_kib",
            "code_pss_kib", "stack_pss_kib", "system_pss_kib", "private_other_pss_kib"
        ], max_elapsed_ms),
        "native_heap": load_csv(sess_dir, "native_heap.csv", [
            "elapsed_ms", "native_heap_size_kib", "native_heap_allocated_kib", "native_heap_free_kib", "native_heap_pss_kib"
        ], max_elapsed_ms),
        "java_heap": load_csv(sess_dir, "java_heap.csv", [
            "elapsed_ms", "java_heap_size_kib", "java_heap_allocated_kib", "java_heap_free_kib", "java_heap_pss_kib"
        ], max_elapsed_ms),
        "graphics_memory": load_csv(sess_dir, "graphics_memory.csv", [
            "elapsed_ms", "graphics_memory_kib", "egl_mtrack_pss_kib", "gl_mtrack_pss_kib",
            "gralloc_total_kib", "gralloc_imagereader_kib", "gralloc_surfaceview_kib",
            "gralloc_vri_kib", "gralloc_other_kib", "skia_gpu_cache_kib"
        ], max_elapsed_ms),
        "graphics_frames": load_csv(sess_dir, "graphics_frames.csv", [
            "elapsed_ms", "sf_fps_estimate", "sf_frame_p50_ms", "sf_frame_p95_ms", "sf_frame_p99_ms",
            "sf_frames_in_window", "sf_janky_frames", "total_frames_rendered", "janky_frame_percent", "frame_p95_ms"
        ], max_elapsed_ms),
        "process": load_csv(sess_dir, "process.csv", [
            "elapsed_ms", "pid", "rss_kib", "rss_anon_kib", "rss_file_kib", "rss_shmem_kib",
            "vm_swap_kib", "threads", "minor_faults", "major_faults"
        ], max_elapsed_ms),
        "device_memory": load_csv(sess_dir, "device_memory.csv", [
            "elapsed_ms", "device_total_ram_kib", "device_available_ram_kib", "device_free_ram_kib",
            "device_cached_kib", "device_swap_used_kib"
        ], max_elapsed_ms),
        "events": load_csv(sess_dir, "events.csv", [
            "event_id", "utc_timestamp", "elapsed_ms", "event_name", "description"
        ], max_elapsed_ms)
    }


def session_sort_key(sess_dir):
    meta_path = os.path.join(sess_dir, "metadata.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path) as f:
                return (json.load(f).get("monitoring", {}).get("start_time_utc", ""), sess_dir)
        except Exception:
            pass
    return ("", sess_dir)


def main():
    sess_dirs = sorted(glob.glob(os.path.join(RESULTS_DIR, "session_*")), key=session_sort_key)
    sessions = []
    for idx in range(3):
        slot_id = f"session_{idx + 1}"
        if idx < len(sess_dirs):
            # Cap Session 1 to 30 minutes (1,800,000 ms) so late orphan samples don't shrink the X-axis
            cap_ms = 1800000 if os.path.basename(sess_dirs[idx]) == "session_20261125_203346" else None
            data = load_session(sess_dirs[idx], max_elapsed_ms=cap_ms)
            dur_min = (data["metadata"]["monitoring"]["duration_ms"] / 60000.0) if data else 0
            sessions.append({
                "slot": slot_id,
                "label": f"Session {idx + 1}",
                "sublabel": f"{dur_min:.1f} min" if data else "Pending",
                "status": "ready" if data else "pending",
                "data": data
            })
        else:
            sessions.append({
                "slot": slot_id,
                "label": f"Session {idx + 1}",
                "sublabel": "Awaiting manual test",
                "status": "pending",
                "data": None
            })

    with open(OUT_PATH, "w") as f:
        f.write("window.KULFI_SESSIONS = ")
        json.dump({"sessions": sessions}, f, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {OUT_PATH} ({os.path.getsize(OUT_PATH)} bytes, {len(sess_dirs)} recorded session(s))")


if __name__ == "__main__":
    main()
