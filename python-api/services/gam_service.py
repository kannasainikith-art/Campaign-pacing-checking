from googleads import ad_manager
from config.client import get_service

line_item_service = get_service("LineItemService")


def get_line_item(line_item_id):

    statement = (
        ad_manager.StatementBuilder()
        .Where("id = :id")
        .WithBindVariable("id", line_item_id)
    )

    response = line_item_service.getLineItemsByStatement(
        statement.ToStatement()
    )

    if response and "results" in response:
        return response["results"][0]

    return None


def pause_line_item(line_item_id):

    statement = (
        ad_manager.StatementBuilder()
        .Where("id = :id")
        .WithBindVariable("id", line_item_id)
    )

    result = line_item_service.performLineItemAction(
        {
            "xsi_type": "PauseLineItems"
        },
        statement.ToStatement()
    )

    return result


def resume_line_item(line_item_id):

    statement = (
        ad_manager.StatementBuilder()
        .Where("id = :id")
        .WithBindVariable("id", line_item_id)
    )

    result = line_item_service.performLineItemAction(
        {
            "xsi_type": "ResumeLineItems"
        },
        statement.ToStatement()
    )

    return result