import ast
import pkgutil
import re



# This entire file is shamelessly taken from browsergym source code

TWIN_ID_ATTRIBUTE = "data-twin-unique-id"
IGNORED_AXTREE_ROLES = ["LineBreak"]
IGNORED_AXTREE_PROPERTIES = (
    "editable",
    "readonly",
    "level",
    "settable",
    "multiline",
    "invalid",
    "focusable",
    "url",  # Duplicates the href - maybe removing the href would work though
)


def generate_axt(page: playwright.sync_api.Page) -> str:
    mark_frames(page)
    axt_object = extract_merged_axtree(page)
    axt = flatten_axtree_to_str(axt_object)
    return axt


def mark_frames(page: playwright.sync_api.Page):
    """
    pre-extraction routine, marks dom elements (set bid and dynamic attributes like value & checked)
    """
    js_frame_mark_elements = pkgutil.get_data(
        __name__,
        "js_scripts/frame-mark-elements.js",
    )
    if js_frame_mark_elements is None:
        print("Failed to load frame-mark-elements.js")
        return
    js_frame_mark_elements = js_frame_mark_elements.decode("utf-8")

    # we can't run this loop in JS due to Same-Origin Policy
    # (can't access the content of an iframe from another one)
    def mark_frames_recursive(frame, frame_bid: str):
        if not (frame_bid == "" or (frame_bid.islower() and frame_bid.isalpha())):
            print(f"Invalid frame bid: {frame_bid}. Skipping this frame.")
            return

        # mark all DOM elements in the frame (it'll use the parent frame element's bid as a prefix)
        warning_msgs =   frame.evaluate(
            js_frame_mark_elements,
            [frame_bid, TWIN_ID_ATTRIBUTE],
        )
        # print warning messages if any
        for msg in warning_msgs:
            print(msg)

        # recursively mark all descendant frames
        for child_frame in frame.child_frames:
            # deal with detached frames
            if child_frame.is_detached():
                continue
            # deal with weird frames (pdf viewer in <embed>)
            child_frame_elem =   child_frame.frame_element()
            content_frame =   child_frame_elem.content_frame()
            if not content_frame == child_frame:
                print(
                    f"Skipping frame '{child_frame.name}' for marking, seems problematic."
                )
                continue
            # deal with sandboxed frames with blocked script execution
            sandbox_attr =   child_frame_elem.get_attribute("sandbox")
            if sandbox_attr is not None and "allow-scripts" not in sandbox_attr.split():
                continue
            child_frame_bid =   child_frame_elem.get_attribute(TWIN_ID_ATTRIBUTE)
            if child_frame_bid is None:
                print("Cannot mark a child frame without a bid. Skipping.")
                continue
            mark_frames_recursive(child_frame, frame_bid=child_frame_bid)

    # mark all frames recursively
    mark_frames_recursive(page.main_frame, frame_bid="")


def extract_all_frame_axtrees(page: playwright.sync_api.Page):
    """
    Extracts the AXTree of all frames (main document and iframes) of a Playwright page using Chrome
    DevTools Protocol.

    Args:
        page: the playwright page of which to extract the frame AXTrees.

    Returns:
        A dictionnary of AXTrees (as returned by Chrome DevTools Protocol) indexed by frame IDs.

    """
    cdp =   page.context.new_cdp_session(page)

    # extract the frame tree
    frame_tree =   cdp.send(
        "Page.getFrameTree",
        {},
    )

    # extract all frame IDs into a list
    # (breadth-first-search through the frame tree)
    frame_ids = []
    root_frame = frame_tree["frameTree"]
    frames_to_process = [root_frame]
    while frames_to_process:
        frame = frames_to_process.pop()
        frames_to_process.extend(frame.get("childFrames", []))
        # extract the frame ID
        frame_id = frame["frame"]["id"]
        frame_ids.append(frame_id)

    # extract the AXTree of each frame
    frame_axtrees = {}
    for frame_id in frame_ids:
        try:
            axtree =   cdp.send(
                "Accessibility.getFullAXTree",
                {"frameId": frame_id},
            )
            frame_axtrees[frame_id] = axtree
        except playwright.sync_api.Error:
            print(f"Failed to extract AXTree for frame {frame_id}")

    cdp.detach()

    # extract browsergym properties (bids, coordinates, etc.) from the "roledescription" property
    # ("aria-roledescription" attribute)
    for ax_tree in frame_axtrees.values():
        for node in ax_tree["nodes"]:
            # look for the "roledescription" property
            if "properties" in node:
                for i, prop in enumerate(node["properties"]):
                    if prop["name"] == "roledescription":
                        aria_data = AriaData.from_aria_string(prop["value"]["value"])
                        bid, href, original_aria, visibility = (
                            aria_data.bid,
                            aria_data.href,
                            aria_data.original_aria,
                            aria_data.visibility,
                        )
                        prop["value"]["value"] = original_aria
                        # remove the "roledescription" property if empty
                        if original_aria == "":
                            del node["properties"][i]
                        # add all extracted "browsergym" properties to the AXTree
                        if bid:
                            node["properties"].append(
                                {
                                    "name": "browsergym_id",
                                    "value": {
                                        "type": "string",
                                        "value": bid,
                                    },
                                }
                            )
                        # We only want to highlight this if node is interactable, but not visible
                        if bid != "*" and not visibility:
                            node["properties"].append(
                                {
                                    "name": "visible",
                                    "value": {
                                        "type": "string",
                                        "value": visibility,
                                    },
                                }
                            )
                        if href:
                            node["properties"].append(
                                {
                                    "name": "href",
                                    "value": {
                                        "type": "string",
                                        "value": href,
                                    },
                                }
                            )
    return frame_axtrees


# TODO: handle more data items if needed
__BID_EXPR = r"([a-z0-9]+)"
__FLOAT_EXPR = r"([+-]?(?:[0-9]*[.])?[0-9]+)"
__BOOL_EXPR = r"([01])"
# bid, bbox_left, bbox_top, center_x, center_y, bbox_right, bbox_bottom, is_in_viewport
__DATA_REGEXP = re.compile(__BID_EXPR + r"_" + r"(.*)")


async def extract_merged_axtree(page: playwright.sync_api.Page):
    """
    Extracts the merged AXTree of a Playwright page (main document and iframes AXTrees merged) using
    Chrome DevTools Protocol.

    Args:
        page: the playwright page of which to extract the merged AXTree.

    Returns:
        A merged AXTree (same format as those returned by Chrome DevTools Protocol).

    """
    frame_axtrees =   extract_all_frame_axtrees(page)

    cdp =   page.context.new_cdp_session(page)

    # merge all AXTrees into one
    merged_axtree = {"nodes": []}
    for ax_tree in frame_axtrees.values():
        merged_axtree["nodes"].extend(ax_tree["nodes"])
        # connect each iframe node to the corresponding AXTree root node
        for node in ax_tree["nodes"]:
            if node["role"]["value"] == "Iframe":
                try:
                    node_description =   cdp.send(
                        "DOM.describeNode", {"backendNodeId": node["backendDOMNodeId"]}
                    )
                    frame_id = node_description["node"]["frameId"]
                    # it seems Page.getFrameTree() from CDP omits certain Frames (empty frames?)
                    # if a frame is not found in the extracted AXTrees, we just ignore it
                    if frame_id in frame_axtrees:
                        # root node should always be the first node in the AXTree
                        frame_root_node = frame_axtrees[frame_id]["nodes"][0]
                        if frame_root_node["frameId"] != frame_id:
                            print("Unexpected value for frame root node's frame ID")
                        else:
                            node["childIds"].append(frame_root_node["nodeId"])
                    else:
                        print(f"Extracted AXTree does not contain frameId '{frame_id}'")
                except playwright.sync_api.Error as e:
                    print(f"Error processing iframe node: {e}")

    cdp.detach()

    return merged_axtree


def _process_bid(
    bid,
    extra_properties: dict = None,  # type: ignore
    with_visible: bool = False,
    with_clickable: bool = False,
    with_center_coords: bool = False,
    with_bounding_box_coords: bool = False,
    with_som: bool = False,
    filter_visible_only: bool = False,
    filter_with_bid_only: bool = False,
    filter_som_only: bool = False,
    coord_decimals: int = 0,
):
    """
    Process extra attributes and attribute-based filters, for the element with the given bid.

    Returns:
        A flag indicating if the element should be skipped or not (due to filters).
        Attributes to be printed, as a list of "x=y" strings.
    """

    if extra_properties is None:
        if any(
            (
                with_visible,
                with_clickable,
                with_center_coords,
                with_bounding_box_coords,
                with_som,
                filter_visible_only,
                filter_with_bid_only,
                filter_som_only,
            )
        ):
            raise ValueError("extra_properties argument required")
        else:
            extra_properties = {}

    skip_element = False
    attributes_to_print = []

    if bid is None:
        # skip nodes without a bid (if requested)
        if filter_with_bid_only:
            skip_element = True
        if filter_som_only:
            skip_element = True
        if filter_visible_only:
            # element without bid have no visibility mark, they could be visible or non-visible
            # TODO: we consider them as visible. Is this what we want? Now that duplicate bids are
            #   handles, should we mark all non-html elements?
            pass  # keep elements without visible property
            # skip_element = True  # filter elements without visible property

    # parse extra browsergym properties, if node has a bid
    else:
        if bid in extra_properties:
            node_props = extra_properties[bid]
            node_vis = node_props.get("visibility", 0)
            node_bbox = node_props.get("bbox")
            node_is_clickable = node_props.get("clickable", False)
            node_in_som = node_props.get("set_of_marks", False)
            node_is_visible = node_vis >= 0.5
            # skip non-visible nodes (if requested)
            if filter_visible_only and not node_is_visible:
                skip_element = True
            if filter_som_only and not node_in_som:
                skip_element = True
            # print extra attributes if requested (with new names)
            if with_som and node_in_som:
                attributes_to_print.insert(0, "som")
            if with_visible and node_is_visible:
                attributes_to_print.insert(0, "visible")
            if with_clickable and node_is_clickable:
                attributes_to_print.insert(0, "clickable")
            if with_center_coords and node_bbox is not None:
                try:
                    x, y, width, height = node_bbox
                    center = (x + width / 2, y + height / 2)
                    attributes_to_print.insert(
                        0, f'center="{_get_coord_str(center, coord_decimals)}"'
                    )
                except (ValueError, TypeError):
                    print(f"Invalid bounding box for bid {bid}: {node_bbox}")
            if with_bounding_box_coords and node_bbox is not None:
                try:
                    x, y, width, height = node_bbox
                    box = (x, y, x + width, y + height)
                    attributes_to_print.insert(0, f'box="{_get_coord_str(box, coord_decimals)}"')
                except (ValueError, TypeError):
                    print(f"Invalid bounding box for bid {bid}: {node_bbox}")

    return skip_element, attributes_to_print


def _get_coord_str(coord, decimals):
    if isinstance(coord, str):
        try:
            coord = list(map(float, ast.literal_eval(coord)))
        except (ValueError, SyntaxError):
            print(f"Invalid coordinate string: {coord}")
            return "()"

    try:
        coord_format = f".{decimals}f"
        coord_str = ",".join([f"{c:{coord_format}}" for c in coord])
        return f"({coord_str})"
    except (ValueError, TypeError):
        print(f"Invalid coordinate: {coord}")
        return "()"


def _remove_redundant_static_text(ax_tree: str) -> str:
    """Removes redundant `StaticText` from the accessibility tree"""
    new_lines = []
    lines = ax_tree.split("\n")
    for line in lines:
        if line.strip().startswith("StaticText"):
            content = line.split("StaticText")[1].strip().strip("'")
            if content in "\n".join(new_lines[-3:]):
                continue
        new_lines.append(line)
    return "\n".join(new_lines)


def flatten_axtree_to_str(
    AX_tree,
    extra_properties: dict = None,  # type: ignore
    with_visible: bool = False,
    with_clickable: bool = False,
    with_center_coords: bool = False,
    with_bounding_box_coords: bool = False,
    with_som: bool = False,
    filter_visible_only: bool = False,
    filter_with_bid_only: bool = False,
    filter_som_only: bool = False,
    coord_decimals: int = 0,
    ignored_roles=IGNORED_AXTREE_ROLES,
    ignored_properties=IGNORED_AXTREE_PROPERTIES,
    remove_redundant_static_text: bool = True,
    hide_bid_if_invisible: bool = False,
    hide_all_children: bool = False,
) -> str:
    """Formats the accessibility tree into a string text"""
    node_id_to_idx = {}
    for idx, node in enumerate(AX_tree["nodes"]):
        node_id_to_idx[node["nodeId"]] = idx

    def dfs(node_idx: int, depth: int, parent_node_filtered: bool) -> str:
        tree_str = ""
        node = AX_tree["nodes"][node_idx]
        indent = "\t" * depth
        skip_node = False
        filter_node = False
        node_role = node["role"]["value"]

        if node_role in ignored_roles:
            skip_node = True
            pass
        elif "name" not in node:
            skip_node = True
            pass
        else:
            node_name = node["name"]["value"]
            if "value" in node and "value" in node["value"]:
                node_value = node["value"]["value"]
            else:
                node_value = None

            attributes = []
            bid = None
            for property in node.get("properties", []):
                if "value" not in property:
                    continue
                if "value" not in property["value"]:
                    continue

                prop_name = property["name"]
                prop_value = property["value"]["value"]

                if prop_name == "browsergym_id":
                    bid = prop_value
                elif prop_name in ignored_properties:
                    continue
                elif prop_name in ("required", "focused", "atomic"):
                    if prop_value:
                        attributes.append(prop_name)
                else:
                    attributes.append(f"{prop_name}={repr(prop_value)}")

            if node_role == "generic" and not attributes:
                skip_node = True

            if node_role == "StaticText":
                if parent_node_filtered:
                    skip_node = True
            else:
                filter_node, extra_attributes_to_print = _process_bid(
                    bid,
                    extra_properties=extra_properties,
                    with_visible=with_visible,
                    with_clickable=with_clickable,
                    with_center_coords=with_center_coords,
                    with_bounding_box_coords=with_bounding_box_coords,
                    with_som=with_som,
                    filter_visible_only=filter_visible_only,
                    filter_with_bid_only=filter_with_bid_only,
                    filter_som_only=filter_som_only,
                    coord_decimals=coord_decimals,
                )

                # if either is True, skip the node
                skip_node = skip_node or filter_node or (hide_all_children and parent_node_filtered)

                # insert extra attributes before regular attributes
                attributes = extra_attributes_to_print + attributes

            # actually print the node string
            if not skip_node:
                node_str = f"{node_role} {repr(node_name.strip())}"

                if not (
                    bid is None
                    or (
                        hide_bid_if_invisible
                        and extra_properties.get(bid, {}).get("visibility", 0) < 0.5
                    )
                ):
                    node_str = f"[{bid}] " + node_str

                if node_value is not None:
                    node_str += f' value={repr(node["value"]["value"])}'

                if attributes:
                    node_str += ", ".join([""] + attributes)

                tree_str += f"{indent}{node_str}"

        for child_node_id in node["childIds"]:
            if child_node_id not in node_id_to_idx or child_node_id == node["nodeId"]:
                continue
            # mark this to save some tokens
            child_depth = depth if skip_node else (depth + 1)
            child_str = dfs(
                node_id_to_idx[child_node_id], child_depth, parent_node_filtered=filter_node
            )
            if child_str:
                if tree_str:
                    tree_str += "\n"
                tree_str += child_str

        return tree_str

    tree_str = dfs(0, 0, False)
    if remove_redundant_static_text:
        tree_str = _remove_redundant_static_text(tree_str)
    return tree_str
