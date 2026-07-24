#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_IMAGE="refgd/session-deck"
IMAGE_NAME="${IMAGE_NAME:-$DEFAULT_IMAGE}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
OUTPUT_DIR="${OUTPUT_DIR:-$SCRIPT_DIR/dist-docker}"
PUSH_IMAGE=0
SAVE_TAR=0
PLATFORM=""

usage() {
  cat <<'EOF'
Usage:
  ./build-docker.sh [options]

Options:
  --image NAME       Image repository name. Default: refgd/session-deck
  --tag TAG          Image tag. Default: latest
  --registry HOST    Prefix image with a private registry host.
                     Example: --registry registry.example.com
  --platform VALUE   Pass --platform to docker build.
                     Example: linux/amd64
  --push             Push the image after build.
  --tar              Export docker save output to dist-docker/*.tar.gz.
  --output-dir DIR   Directory for --tar output. Default: ./dist-docker
  -h, --help         Show this help.

Examples:
  ./build-docker.sh
  ./build-docker.sh --tag 2026-07-21 --push
  ./build-docker.sh --registry registry.example.com --tag stage1 --push
  ./build-docker.sh --tag stage1 --tar
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE_NAME="${2:?missing value for --image}"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="${2:?missing value for --tag}"
      shift 2
      ;;
    --registry)
      registry="${2:?missing value for --registry}"
      IMAGE_NAME="${registry%/}/${IMAGE_NAME}"
      shift 2
      ;;
    --platform)
      PLATFORM="${2:?missing value for --platform}"
      shift 2
      ;;
    --push)
      PUSH_IMAGE=1
      shift
      ;;
    --tar)
      SAVE_TAR=1
      shift
      ;;
    --output-dir)
      OUTPUT_DIR="${2:?missing value for --output-dir}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$IMAGE_NAME" =~ [A-Z] ]]; then
  lower_image="$(printf '%s' "$IMAGE_NAME" | tr '[:upper:]' '[:lower:]')"
  echo "Docker image repository names must be lowercase: $IMAGE_NAME -> $lower_image" >&2
  IMAGE_NAME="$lower_image"
fi

IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"

build_args=(docker build -t "$IMAGE_REF")
if [[ -n "$PLATFORM" ]]; then
  build_args+=(--platform "$PLATFORM")
fi
build_args+=("$SCRIPT_DIR")

echo "[docker] build $IMAGE_REF"
"${build_args[@]}"

if [[ "$SAVE_TAR" -eq 1 ]]; then
  mkdir -p "$OUTPUT_DIR"
  safe_name="$(printf '%s_%s' "$IMAGE_NAME" "$IMAGE_TAG" | tr '/:' '__')"
  tar_path="$OUTPUT_DIR/${safe_name}.tar.gz"
  echo "[docker] save $IMAGE_REF -> $tar_path"
  docker save "$IMAGE_REF" | gzip -c > "$tar_path"
fi

if [[ "$PUSH_IMAGE" -eq 1 ]]; then
  echo "[docker] push $IMAGE_REF"
  docker push "$IMAGE_REF"
fi

echo "[docker] done: $IMAGE_REF"
