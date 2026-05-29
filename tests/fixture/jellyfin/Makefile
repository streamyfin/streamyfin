# Jellyfin Test Fixture
# Pre-configured Jellyfin instance for Streamyfin UI testing

.PHONY: help up up-clean down status logs wait-ready api-test save-config init

JELLYFIN_URL ?= http://localhost:8096
DEMO_USER ?= admin
DEMO_PASSWORD ?= admin

help:
	@echo "Jellyfin Test Fixture - Available targets:"
	@echo "  up          - Start Jellyfin with external URL configured"
	@echo "  up-clean    - Start Jellyfin (blank slate, no base_config)"
	@echo "  down        - Stop and remove container"
	@echo "  status      - Check if Jellyfin is running"
	@echo "  logs        - Show container logs"
	@echo "  api-test    - Test API connectivity and login"
	@echo "  save-config - Save current config to base_config/"
	@echo "  init        - Auto-initialize a blank Jellyfin instance"
	@echo ""
	@echo "Workflow:"
	@echo "  1. make up-clean  -> configure in browser -> make save-config"
	@echo "  2. make up        -> starts with base_config + external URL set"

# Auto-migrate from old static/config if present
_migrate-config:
	@if [ -d ./static/config ] && [ ! -d ./base_config ]; then \
		echo "Migrating static/config -> base_config..."; \
		mv ./static/config ./base_config; \
		rmdir ./static 2>/dev/null || true; \
	fi

up: _migrate-config
	@echo "Starting Jellyfin with base_config..."
	@echo "Cleaning up previous data..."
	@rm -rf ./config ./cache
	@mkdir -p ./config ./cache
	@if [ -d ./base_config ]; then \
		echo "Copying base_config to config..."; \
		cp -r ./base_config/* ./config/ 2>/dev/null || true; \
		chmod -R 777 ./config 2>/dev/null || true; \
	else \
		echo "No base_config found, starting fresh (run init if needed)..."; \
	fi
	@docker compose up -d
	@echo "Waiting for Jellyfin to be ready..."
	@$(MAKE) wait-ready
	@echo ""
	@echo "Setting external URL for mobile testing..."
	@bash ./scripts/set-external-url.sh "$(JELLYFIN_URL)" "$(DEMO_USER)" "$(DEMO_PASSWORD)" "http://10.0.2.2:8096" || echo "Warning: Could not set external URL (may need init first)"
	@echo ""
	@echo "Updating .env.local with mobile URL..."
	@if [ -f ../../ui-testing/.env.local ]; then \
	  if grep -q "MAESTRO_SERVER_URL=" ../../ui-testing/.env.local; then \
	    sed -i.bak 's|MAESTRO_SERVER_URL=.*|MAESTRO_SERVER_URL=http://10.0.2.2:8096|' ../../ui-testing/.env.local && rm -f ../../ui-testing/.env.local.bak; \
	    echo "  Updated MAESTRO_SERVER_URL=http://10.0.2.2:8096 in tests/ui-testing/.env.local"; \
	  else \
	    echo "MAESTRO_SERVER_URL=http://10.0.2.2:8096" >> ../../ui-testing/.env.local; \
	    echo "  Added MAESTRO_SERVER_URL=http://10.0.2.2:8096 to tests/ui-testing/.env.local"; \
	  fi; \
	else \
	  echo "  No tests/ui-testing/.env.local found (may use .env.jeef or other)"; \
	fi
	@echo ""
	@echo "Jellyfin is ready at $(JELLYFIN_URL)"
	@echo "Login: $(DEMO_USER) / $(DEMO_PASSWORD)"

up-clean:
	@echo "Starting Jellyfin with clean slate (no base_config)..."
	@echo "Cleaning up previous data..."
	@rm -rf ./config ./cache
	@mkdir -p ./config ./cache
	@docker compose up -d
	@echo "Waiting for Jellyfin to be ready..."
	@$(MAKE) wait-ready
	@echo ""
	@echo "Jellyfin is ready at $(JELLYFIN_URL)"
	@echo "This is a blank instance - run 'make init' to auto-configure"
	@echo ""
	@echo "After init, external URL will be auto-set to: http://10.0.2.2:8096"

save-config:
	@echo "Saving current config to base_config..."
	@echo "Stopping Jellyfin to flush database WAL..."
	@docker compose stop > /dev/null 2>&1 || true
	@sleep 2
	@rm -rf ./base_config
	@mkdir -p ./base_config/config ./base_config/data/ScheduledTasks
	@cp -r ./config/* ./base_config/config/ 2>/dev/null || true
	@cp ./data/jellyfin.db ./base_config/data/ 2>/dev/null || true
	@cp ./data/device.txt ./base_config/data/ 2>/dev/null || true
	@cp -r ./data/ScheduledTasks ./base_config/data/ 2>/dev/null || true
	@echo "Config saved to ./base_config"
	@echo "Included: config/, data/jellyfin.db, data/device.txt"
	@echo "Excluded: logs, metadata, plugins, WAL files"
	@echo "Restart with: docker compose start  (or just run make up)"

down:
	@docker compose down -v
	@echo "Jellyfin stopped and volumes removed"

status:
	@docker compose ps -a

logs:
	@docker compose logs -f

wait-ready:
	@echo "Waiting for Jellyfin to be ready..."
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

init:
	@bash ./scripts/init-jellyfin.sh

api-test:
	@echo "Testing Jellyfin API..."
	@bash ./scripts/api-test.sh "$(JELLYFIN_URL)" "$(DEMO_USER)" "$(DEMO_PASSWORD)"
