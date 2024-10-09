from __future__ import annotations

import asyncio
from collections import Counter

from playwright.sync_api import Page


def flag_interactable_elements(page: Page):
    """
    Checks whether every interactable element has an ID, and if it
    doesn't, assign one to it
    """
    try:
        detect_event_listeners(page)
    except Exception as err:
        print("Error during CDP event listener detection:", err)
    page.evaluate(("const htmlProcessor = new window.HtmlProcessor(); htmlProcessor.run();"))


def detect_event_listeners(page: Page):
    clickable_event_listeners, max_listeners = ["click", "mousedown", "dblclick"], 10
    client = page.context.new_cdp_session(page)

    document_node_id = (client.send("DOM.getDocument"))["root"]["nodeId"]  # type: ignore
    body_node_id = (
        client.send("DOM.querySelector", {"nodeId": document_node_id, "selector": "body"})
    )["nodeId"]
    body_node = client.send("DOM.resolveNode", {"nodeId": body_node_id})
    body_listeners = (
        client.send(
            "DOMDebugger.getEventListeners",
            {"objectId": body_node["object"]["objectId"], "depth": -1},
        )
    )["listeners"]
    click_listeners = [
        listener
        for listener in body_listeners
        if listener["type"] in clickable_event_listeners  # type: ignore
    ]
    counters = Counter([listener["backendNodeId"] for listener in click_listeners])
    click_listener_node_ids = [
        listener["backendNodeId"]
        for listener in click_listeners
        if max_listeners >= counters[listener["backendNodeId"]] > 0
    ]
    node_ids = client.send(
        "DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": click_listener_node_ids}
    )

    def process_node(node_id):
        try:
            client.send(
                "DOM.setAttributeValue",
                {
                    "nodeId": node_id,
                    "name": "data-twin-agent-element-has-click-listener",
                    "value": "1",
                },
            )
        except Exception as e:
            print(exception=e).warning("Error processing node")
            return None
    for node_id in node_ids["nodeIds"]:
        process_node(node_id)
    client.detach()


def add_simple_ids(page: Page):
    page.evaluate(
        ("const htmlProcessor = new window.HtmlProcessor(); htmlProcessor.runAddIds();")
    )
