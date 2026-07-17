#!/bin/bash
# Bootstrap a Frappe bench + test site with the draw app installed, for the
# server-tests CI job. Mirrors the standard Frappe app pattern (see frappe/gameplan,
# frappe/builder). MariaDB + Redis are provided as GitHub Actions service containers.
set -e

cd "$HOME" || exit 1

pip install frappe-bench

# Frappe is pulled from `develop` (this app targets Frappe 16/develop). Skip redis
# config generation — CI provides Redis via service containers on the ports Frappe's
# default common_site_config expects (cache 13000, queue 11000). Skip asset build
# (server tests don't need the built frontend).
bench init --skip-redis-config-generation --skip-assets \
  --frappe-branch develop --python "$(which python)" frappe-bench

# Frappe requires utf8mb4 on the server.
mysql --host 127.0.0.1 --port 3306 -u root -proot -e "SET GLOBAL character_set_server = 'utf8mb4'"
mysql --host 127.0.0.1 --port 3306 -u root -proot -e "SET GLOBAL collation_server = 'utf8mb4_unicode_ci'"

cd "$HOME/frappe-bench" || exit 1

# Install this checkout as the `draw` app, then create a test site with it.
bench get-app draw "${GITHUB_WORKSPACE}"
bench new-site --db-root-password root --admin-password admin \
  --no-mariadb-socket --install-app draw test_site
bench --site test_site set-config allow_tests true
