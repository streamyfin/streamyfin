# Jellyfin Test Fixture
# Pre-configured Jellyfin instance for Streamyfin UI testing

.PHONY: help up up-clean reset down status logs wait-ready api-test save-config configure-urls configure-maestro-ids scan-library download-media clean-media

JELLYFIN_URL ?= http://localhost:8096
DEMO_USER ?= admin
DEMO_PASSWORD ?= admin
MAESTRO_TARGET ?= android
MAESTRO_ENV_FILE ?= ../../maestro/.env.local
JELLYFIN_PORT ?= 8096

.DEFAULT_GOAL := help

help:
	@printf '\n%s\n' 'Jellyfin test fixture'
	@printf '%s\n\n' 'Usage: make -C tests/fixtures/jellyfin <target>'
	@printf '%s\n' 'Configuration'
	@printf '  %-18s %s\n' 'JELLYFIN_URL' 'Host URL used by helper scripts. Default: http://localhost:8096'
	@printf '  %-18s %s\n' 'DEMO_USER' 'Demo/admin user used by helper scripts. Default: admin'
	@printf '  %-18s %s\n' 'DEMO_PASSWORD' 'Demo/admin password used by helper scripts. Default: admin'
	@printf '  %-18s %s\n' 'MAESTRO_TARGET' 'android, ios, or device. Default: android'
	@printf '  %-18s %s\n' 'MAESTRO_ENV_FILE' 'Maestro env file to update. Default: ../../maestro/.env.local'
	@printf '  %-18s %s\n\n' 'JELLYFIN_HOST_IP' 'Optional LAN IP override for physical devices.'
	@printf '%s\n' 'Primary Workflow'
	@printf '  %-18s %s\n' 'reset' 'Discard runtime config and start blank Jellyfin for manual setup.'
	@printf '  %-18s %s\n' 'up' 'Start from base_config and publish localhost, emulator, and LAN URLs.'
	@printf '  %-18s %s\n\n' 'down' 'Stop and remove the fixture container and volumes.'
	@printf '%s\n' 'Manual Setup'
	@printf '  %-18s %s\n' 'clean-media' 'Delete generated fixture media while preserving media directories.'
	@printf '  %-18s %s\n' 'download-media' 'Download/transcode public fixture media from stable source URLs.'
	@printf '  %-18s %s\n' 'up-clean' 'Start with blank runtime config and no base_config copy.'
	@printf '  %-18s %s\n\n' 'save-config' 'Snapshot current runtime config into base_config.'
	@printf '%s\n' 'Inspection'
	@printf '  %-18s %s\n' 'status' 'Show Docker Compose service status.'
	@printf '  %-18s %s\n' 'logs' 'Follow Jellyfin container logs.'
	@printf '  %-18s %s\n' 'api-test' 'Verify server info, login, libraries, and media lists.'
	@printf '  %-18s %s\n' 'configure-urls' 'Update Maestro env with the reachable Jellyfin URL.'
	@printf '  %-18s %s\n' 'configure-maestro-ids' 'Update Maestro env with Jellyfin library and fixture media selectors.'
	@printf '  %-18s %s\n' 'scan-library' 'Trigger a Jellyfin library scan.'
	@printf '  %-18s %s\n\n' 'wait-ready' 'Wait until Jellyfin public info endpoint responds.'

# Auto-migrate from old static/config if present
_migrate-config:
	@if [ -d ./static/config ] && [ ! -d ./base_config ]; then \
		echo "Migrating static/config -> base_config..."; \
		mv ./static/config ./base_config; \
		rmdir ./static 2>/dev/null || true; \
	fi

up: _migrate-config
	@echo "Starting Jellyfin with base_config..."
	@echo "Cleaning runtime config directory: ./config"
	@echo "Cleaning runtime cache directory: ./cache"
	@echo "Keeping saved snapshot untouched: ./base_config"
	@rm -rf ./config ./cache
	@mkdir -p ./config ./cache
	@if [ -d ./base_config ]; then \
		echo "Copying saved base_config into runtime config..."; \
		echo "  from: ./base_config/"; \
		echo "  to:   ./config/"; \
		cp -r ./base_config/* ./config/ 2>/dev/null || true; \
		echo "Normalizing runtime config permissions for the Jellyfin container..."; \
		chmod -R 777 ./config 2>/dev/null || true; \
	else \
		echo "No base_config found, starting fresh. Complete Jellyfin setup in the UI, then run make save-config."; \
	fi
	@echo "Starting Docker Compose service: jellyfin"
	@docker compose up -d
	@echo "Waiting for Jellyfin to be ready..."
	@$(MAKE) wait-ready
	@echo "Configuring test access URL and scanning libraries after startup..."
	@$(MAKE) configure-urls
	@echo ""
	@echo "Jellyfin is ready at $(JELLYFIN_URL)"
	@echo "Login: $(DEMO_USER) / $(DEMO_PASSWORD)"

configure-urls:
	@echo ""
	@echo "Detecting the Jellyfin URL the selected test target should use..."
	@published_urls=$$(JELLYFIN_PORT="$(JELLYFIN_PORT)" MAESTRO_TARGET="$(MAESTRO_TARGET)" ./scripts/detect-access-urls.sh published); \
	maestro_url=$$(JELLYFIN_PORT="$(JELLYFIN_PORT)" MAESTRO_TARGET="$(MAESTRO_TARGET)" ./scripts/detect-access-urls.sh maestro); \
		echo "Reachable URLs for this machine:"; \
		printf '%s\n' "$$published_urls" | sed '/^$$/d;s/^/  /'; \
		echo ""; \
		env_file="$(MAESTRO_ENV_FILE)"; \
		echo "Updating $$env_file with MAESTRO_SERVER_URL=$$maestro_url"; \
		mkdir -p "$$(dirname "$$env_file")"; \
		touch "$$env_file"; \
		if grep -q "MAESTRO_SERVER_URL=" "$$env_file"; then \
		  sed -i.bak "s|MAESTRO_SERVER_URL=.*|MAESTRO_SERVER_URL=$$maestro_url|" "$$env_file" && rm -f "$$env_file.bak"; \
		else \
		  echo "MAESTRO_SERVER_URL=$$maestro_url" >> "$$env_file"; \
		fi; \
		echo "  Wrote MAESTRO_SERVER_URL=$$maestro_url"
	@echo "Triggering a Jellyfin library scan after startup..."
	@bash ./scripts/refresh-library.sh "$(JELLYFIN_URL)" "$(DEMO_USER)" "$(DEMO_PASSWORD)"
	@echo ""

configure-maestro-ids:
	@echo ""
	@echo "Discovering Jellyfin library and fixture media IDs for Maestro..."
	@JELLYFIN_URL="$(JELLYFIN_URL)" DEMO_USER="$(DEMO_USER)" DEMO_PASSWORD="$(DEMO_PASSWORD)" MAESTRO_ENV_FILE="$(MAESTRO_ENV_FILE)" node ./scripts/discover-maestro-ids.mjs
	@echo ""

up-clean:
	@echo "Starting Jellyfin with clean slate (no base_config)..."
	@echo "Deleting runtime config directory: ./config"
	@echo "Deleting runtime cache directory: ./cache"
	@echo "Leaving saved base_config untouched."
	@rm -rf ./config ./cache
	@mkdir -p ./config ./cache
	@echo "Created empty runtime directories: ./config ./cache"
	@echo "Starting Docker Compose service: jellyfin"
	@docker compose up -d
	@echo "Waiting for Jellyfin to be ready..."
	@$(MAKE) wait-ready
	@echo ""
	@echo "Jellyfin is ready at $(JELLYFIN_URL)"
	@echo "This is a blank instance. Login to Jellyfin and configure admin/admin plus fixture libraries."
	@echo ""
	@echo "When setup is complete, run 'make jellyfin-save-config' from the repo root to overwrite base_config."

reset:
	@echo "Resetting Jellyfin runtime container and config for manual setup."
	@echo "This removes Docker volumes plus ./config and ./cache, but does not overwrite ./base_config."
	@$(MAKE) down
	@$(MAKE) up-clean

download-media:
	@echo "Downloading/transcoding generated movie, show, and music fixture media into ./media."
	@echo "Existing completed media files are skipped."
	@bash ./scripts/download-media.sh

clean-media:
	@echo "Deleting generated fixture media files from ./media."
	@echo "This removes generated videos/music plus the old audiobook directory; Jellyfin config, metadata, thumbnails, and base_config are not touched."
	@mkdir -p ./media/movies ./media/shows ./media/music
	@find ./media -type f \( -name '*.mp4' -o -name '*.mp3' -o -name '*.webm' -o -name '*.tmp' -o -name '*.tmp.mp4' \) -delete
	@rm -rf ./media/audiobooks
	@find ./media/movies ./media/shows ./media/music -mindepth 1 -type d -empty -delete 2>/dev/null || true
	@touch ./media/movies/.gitkeep ./media/shows/.gitkeep ./media/music/.gitkeep
	@echo "Generated media deleted. Media directories are still present."

save-config:
	@echo "Saving current config to base_config..."
	@echo "Stopping Jellyfin to flush database WAL..."
	@docker compose stop > /dev/null 2>&1 || true
	@sleep 2
	@echo "Overwriting saved snapshot directory: ./base_config"
	@rm -rf ./base_config
	@mkdir -p ./base_config
	@echo "Copying runtime config from ./config/ to ./base_config/"
	@cp -R ./config/. ./base_config/ 2>/dev/null || true
	@echo "Removing runtime logs from saved snapshot: ./base_config/log"
	@rm -rf ./base_config/log
	@echo "Config saved to ./base_config"
	@echo "Included: config/, data/, metadata/, root/, plugins/"
	@echo "Excluded: logs and cache"
	@echo "Restart with: docker compose start  (or just run make up)"

down:
	@echo "Stopping and removing Jellyfin fixture containers, networks, and Compose-managed volumes..."
	@docker compose down -v
	@echo "Jellyfin stopped and volumes removed"

status:
	@echo "Docker Compose status for the Jellyfin fixture:"
	@docker compose ps -a

logs:
	@echo "Streaming Jellyfin fixture logs. Press Ctrl-C to stop following logs."
	@docker compose logs -f

wait-ready:
	@echo "Waiting for Jellyfin to be ready..."
	@echo "Polling $(JELLYFIN_URL)/System/Info/Public for up to 120 seconds."
	@for i in $$(seq 1 60); do \
		if curl -sf $(JELLYFIN_URL)/System/Info/Public > /dev/null 2>&1; then \
			echo " Jellyfin is ready"; \
			exit 0; \
		fi; \
		printf "."; \
		sleep 2; \
	done; \
	echo " Timeout waiting for Jellyfin"; \
	exit 1

api-test:
	@echo "Testing Jellyfin API..."
	@echo "Using $(JELLYFIN_URL) with user $(DEMO_USER)."
	@bash ./scripts/api-test.sh "$(JELLYFIN_URL)" "$(DEMO_USER)" "$(DEMO_PASSWORD)"

scan-library:
	@echo "Triggering Jellyfin library scan..."
	@echo "Using $(JELLYFIN_URL) with user $(DEMO_USER)."
	@bash ./scripts/refresh-library.sh "$(JELLYFIN_URL)" "$(DEMO_USER)" "$(DEMO_PASSWORD)"
