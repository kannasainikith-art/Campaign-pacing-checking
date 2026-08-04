from flask import Flask, request, jsonify
from flask_cors import CORS
from googleads import ad_manager
from pprint import pprint

API_VERSION = "v202602"

app = Flask(__name__)
CORS(app)

print("Loading Google Ad Manager client...")

import startup
client = ad_manager.AdManagerClient.LoadFromStorage(
    "googleads.yaml"
)

print("Client loaded successfully.")

line_item_service = client.GetService(
    "LineItemService",
    version=API_VERSION
)


# ============================================================
# HOME
# ============================================================

@app.route("/", methods=["GET"])
def home():

    return jsonify({
        "status": "running",
        "service": "Google Ad Manager SOAP API",
        "version": API_VERSION
    })


# ============================================================
# GET LINE ITEM
# ============================================================

@app.route("/line-item/<int:line_item_id>", methods=["GET"])
def get_line_item(line_item_id):

    try:

        statement = (
            ad_manager.StatementBuilder()
            .Where("id = :id")
            .WithBindVariable("id", line_item_id)
        )

        response = line_item_service.getLineItemsByStatement(
            statement.ToStatement()
        )

        if (
            not response
            or "results" not in response
            or len(response["results"]) == 0
        ):

            return jsonify({
                "success": False,
                "message": "Line Item not found"
            }), 404

        line_item = response["results"][0]

        print("\n================ LINE ITEM ================\n")
        pprint(line_item)
        print("\n==========================================\n")

        frequency_caps = []

        if getattr(line_item, "frequencyCaps", None):

            for fc in line_item.frequencyCaps:

                frequency_caps.append({
                    "maxImpressions": fc.get("maxImpressions"),
                    "numTimeUnits": fc.get("numTimeUnits"),
                    "timeUnit": fc.get("timeUnit")
                })

        return jsonify({

            "success": True,

            "lineItem": {

                "id": line_item.id,
                "name": line_item.name,
                "status": line_item.status,
                "priority": line_item.priority,

                "deliveryRateType":
                    getattr(line_item, "deliveryRateType", None),

                "creativeRotationType":
                    getattr(line_item, "creativeRotationType", None),

                "frequencyCaps":
                    frequency_caps

            }

        })

    except Exception as e:

        return jsonify({

            "success": False,
            "message": str(e)

        }), 500

# ============================================================
# PAUSE LINE ITEM
# ============================================================

@app.route("/pause", methods=["POST"])
def pause():

    try:

        data = request.get_json()

        line_item_id = int(data["lineItemId"])

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

        print(result)

        return jsonify({
            "success": True,
            "message": "Line Item paused successfully"
        })

    except Exception as e:

        print(e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# ============================================================
# RESUME LINE ITEM
# ============================================================

@app.route("/resume", methods=["POST"])
def resume():

    try:

        data = request.get_json()

        line_item_id = int(data["lineItemId"])

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

        print(result)

        return jsonify({
            "success": True,
            "message": "Line Item resumed successfully"
        })

    except Exception as e:

        print(e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

# ============================================================
# UNIVERSAL UPDATE ENDPOINT
# ============================================================

@app.route("/update-line-item", methods=["POST"])
def update_line_item():

    try:

        data = request.get_json()

        line_item_id = int(data["lineItemId"])
        field = data["field"]
        value = data["value"]

        statement = (
         ad_manager.StatementBuilder()
         .Where("id = :id")
         .WithBindVariable("id", line_item_id)
        )

        response = line_item_service.getLineItemsByStatement(
         statement.ToStatement()
        )

        if (
            not response
            or "results" not in response
            or len(response["results"]) == 0
        ):

            return jsonify({
            "success": False,
            "message": "Line Item not found"
            }), 404

        line_item = response["results"][0]

        # --------------------------------------------
        # Build minimal update payload
        # --------------------------------------------

        line_item = response["results"][0]

        update = {
         "id": line_item.id,
         "name": line_item.name,
         "orderId": line_item.orderId,

         "startDateTime": line_item.startDateTime,
         "endDateTime": line_item.endDateTime,

         "costPerUnit": line_item.costPerUnit,
         "costType": line_item.costType,

         "lineItemType": line_item.lineItemType,
         "priority": line_item.priority,

         "primaryGoal": line_item.primaryGoal,

         "targeting": line_item.targeting,

         "creativePlaceholders": line_item.creativePlaceholders,

         "environmentType": line_item.environmentType
        }

    

        if field == "delivery_rate":

            update["deliveryRateType"] = value

        elif field == "creative_rotation":

            update["creativeRotationType"] = value

        elif field == "frequency_cap":

            update["frequencyCaps"] = [
                {
                    "maxImpressions": int(value),
                    "numTimeUnits": 1,
                    "timeUnit": "DAY"
                }
            ]

        else:

            return jsonify({
                "success": False,
                "message": f"Unsupported field: {field}"
            }), 400

        print("\n================ UPDATE REQUEST ================\n")
        pprint(update)

        result = line_item_service.updateLineItems(
            [update]
        )

        print(result)

        return jsonify({

            "success": True,
            "message": "Update request sent to Google Ad Manager",
            "field": field,
            "value": value

        })

    except Exception as e:

        print("\n============= UPDATE FAILED =============")
        print(type(e))
        print(e)

        if hasattr(e, "errors"):
            print(e.errors)

        if hasattr(e, "fault"):
            print(e.fault)

        return jsonify({

            "success": False,
            "message": str(e)

        }), 500


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )