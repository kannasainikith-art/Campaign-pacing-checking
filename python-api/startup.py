import os

config = f"""
ad_manager:
  application_name: {os.environ["APPLICATION_NAME"]}
  network_code: {os.environ["NETWORK_CODE"]}

api_version: v202602

oauth2:
  client_id: {os.environ["CLIENT_ID"]}
  client_secret: {os.environ["CLIENT_SECRET"]}
  refresh_token: {os.environ["REFRESH_TOKEN"]}
"""

with open("googleads.yaml", "w") as f:
    f.write(config)