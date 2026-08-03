from googleads import ad_manager

API_VERSION = "v202602"

client = ad_manager.AdManagerClient.LoadFromStorage("googleads.yaml")


def get_service(service_name):
    return client.GetService(
        service_name,
        version=API_VERSION
    )