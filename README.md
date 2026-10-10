# ascent-robot.github.io

Project page for **ASCENT** — learning *where to stand* so a frozen manipulation
policy can succeed.

Plain static HTML, no build step. GitHub Pages serves `index.html` from the
repository root (`.nojekyll` keeps Pages from reprocessing `assets/`).

```
index.html
assets/css/site.css
assets/js/pipeline.js      the staggered pipeline reveal
assets/panels/*.mp4        seven panel streams + panels.json
assets/video/with-obs.mp4  the full rollout
assets/img/                poster frames
```

## The pipeline figure

`assets/js/pipeline.js` implements one behaviour, and the whole thing depends on
the seven clips being frame-aligned:

1. every panel is frozen on frame 0, dimmed and desaturated;
2. the top-down pane is lit from the start and never dims;
3. groups light up left to right, 400 ms apart — **nothing moves yet**;
4. the instant the last group (`P`) lights, all seven start in the same tick;
5. when the longest stream ends, hold 1.1 s, then run it again.

A watchdog nudges any element that drifts more than 80 ms off the first stream.
The figure freezes when scrolled out of view and restarts when scrolled back.

## Regenerating the panel clips

The seven streams come out of one episode, so they share a frame count and fps.
From the `spar_vla` checkout:

```bash
# 1. run the episode  (LEVEL_B_YAW_OFFSET_DEG turns the base at the start, so
#    the fixture begins at the edge of frame and T has to swing onto it)
sbatch --export=ALL,SEEDS="7036",YAWS="25",DIST=2.5,FRAC=0.55 \
       scripts/run_showcase_episodes.sbatch

# 2. re-render it into seven separate PNG sequences
sbatch --export=ALL,JOB_DIR=<episode dir>,CAM_AZ=180,CAM_ELEV=-85,CAM_DIST=7.5 \
       scripts/run_showcase_panels.sbatch

# 3. encode them into this repo (third arg drops leading frames from ALL
#    streams at once, for trimming an untidy opening manoeuvre)
bash scripts/pack_showcase_panels.sh <panels dir> /home/zsiyuan/ascent_site 0
```

The top-down camera is a free camera aimed at the midpoint of the start pose and
the fixture. `CAM_AZ=180, CAM_ELEV=-85, CAM_DIST=7.5` is the setting that puts
the robot, the obstacle box and the open fridge door all in frame at once; the
script's defaults (`90 / -84 / 5.0`) frame a different start geometry and crop
the fixture out.

## Local preview

```bash
cd ascent_site && python3 -m http.server 8777
```
