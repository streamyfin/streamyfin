#!/bin/sh
set -eu

config_dir=${1:-./config}
media_dir=${2:-$(pwd)/media}

case "$media_dir" in
  /*) ;;
  *)
    printf 'error: media_dir must be an absolute path: %s\n' "$media_dir" >&2
    exit 2
    ;;
esac

if [ ! -d "$config_dir" ]; then
  printf 'error: config_dir does not exist: %s\n' "$config_dir" >&2
  exit 2
fi

if [ -d "$config_dir/root" ]; then
  STREAMYFIN_MEDIA_DIR=$media_dir \
    find "$config_dir/root" -type f -exec perl -0pi -e 's#/media#$ENV{STREAMYFIN_MEDIA_DIR}#g' {} +
fi

db_path="$config_dir/data/jellyfin.db"
if [ ! -f "$db_path" ]; then
  exit 0
fi

sqlite3 "$db_path" <<SQL
.parameter init
.parameter set :media "$media_dir"

UPDATE BaseItems
SET Path = replace(Path, '/media', :media)
WHERE Path = '/media' OR Path LIKE '/media/%';

UPDATE ImageInfos
SET Path = replace(Path, '/media', :media)
WHERE Path = '/media' OR Path LIKE '/media/%';

UPDATE BaseItemImageInfos
SET Path = replace(Path, '/media', :media)
WHERE Path = '/media' OR Path LIKE '/media/%';

UPDATE MediaStreamInfos
SET Path = replace(Path, '/media', :media)
WHERE Path = '/media' OR Path LIKE '/media/%';

UPDATE Chapters
SET ImagePath = replace(ImagePath, '/media', :media)
WHERE ImagePath = '/media' OR ImagePath LIKE '/media/%';
SQL
