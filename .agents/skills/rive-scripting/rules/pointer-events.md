---
name: pointer-events
description: Handling mouse, touch, and pointer interactions in Rive Node scripts
metadata:
  tags: rive, scripting, pointer, events, interaction, touch, mouse
---

# Pointer Events in Rive Scripts

Node scripts can respond to pointer (mouse/touch) events to create interactive graphics.

## Pointer Event Handlers

Add these methods to your Node script to handle pointer events:

```lua
type Interactive = {
  path: Path,
  paint: Paint,
  isPressed: boolean,
  hoverColor: Color,
  normalColor: Color,
}

function pointerDown(self: Interactive, pointer: Vec2D): boolean
  -- Called when pointer pressed
  self.isPressed = true
  return true -- Return true to capture pointer
end

function pointerMove(self: Interactive, pointer: Vec2D)
  -- Called when pointer moves (after capture)
end

function pointerUp(self: Interactive, pointer: Vec2D)
  -- Called when pointer released
  self.isPressed = false
end

return function(): Node<Interactive>
  return {
    pointerDown = pointerDown,
    pointerMove = pointerMove,
    pointerUp = pointerUp,
    draw = draw,
    path = Path.new(),
    paint = Paint.new(),
    isPressed = false,
    hoverColor = Color.rgb(100, 200, 255),
    normalColor = Color.rgb(50, 100, 200),
  }
end
```

## Pointer Capture

Return `true` from `pointerDown` to capture the pointer:

```lua
function pointerDown(self: Interactive, pointer: Vec2D): boolean
  if self:hitTest(pointer) then
    return true -- Capture: receive move/up events
  end
  return false -- Don't capture: ignore subsequent events
end
```

When captured:
- `pointerMove` is called for all pointer movement
- `pointerUp` is called when released
- Other nodes don't receive events for this pointer

## Hit Testing

Check if pointer is within your shape:

```lua
type Button = {
  path: Path,
  paint: Paint,
  bounds: AABB,
  isHovered: boolean,
}

function hitTest(self: Button, pointer: Vec2D): boolean
  return self.bounds:contains(pointer)
end

function pointerDown(self: Button, pointer: Vec2D): boolean
  if hitTest(self, pointer) then
    -- Handle click
    return true
  end
  return false
end
```

### Path Hit Testing

For complex shapes, use path hit testing:

```lua
function pointerDown(self: MyShape, pointer: Vec2D): boolean
  -- Check if pointer is inside the path
  if self.path:contains(pointer) then
    return true
  end
  return false
end
```

## Multi-Touch Support

Each touch has a unique pointer ID:

```lua
type MultiTouch = {
  touches: {[number]: Vec2D}, -- Map pointer ID to position
  paint: Paint,
  path: Path,
}

function pointerDown(self: MultiTouch, pointer: Vec2D, pointerId: number): boolean
  self.touches[pointerId] = pointer
  return true
end

function pointerMove(self: MultiTouch, pointer: Vec2D, pointerId: number)
  self.touches[pointerId] = pointer
end

function pointerUp(self: MultiTouch, pointer: Vec2D, pointerId: number)
  self.touches[pointerId] = nil
end

function draw(self: MultiTouch, renderer: Renderer)
  -- Draw circle at each touch point
  for id, pos in pairs(self.touches) do
    self.path:reset()
    self.path:addOval(AABB.xywh(pos.x - 20, pos.y - 20, 40, 40))
    renderer:drawPath(self.path, self.paint)
  end
end
```

## Interactive Examples

### Draggable Circle

```lua
type Draggable = {
  path: Path,
  paint: Paint,
  position: Vec2D,
  radius: number,
  isDragging: boolean,
  dragOffset: Vec2D,
}

function hitTest(self: Draggable, pointer: Vec2D): boolean
  local dx = pointer.x - self.position.x
  local dy = pointer.y - self.position.y
  return (dx * dx + dy * dy) <= (self.radius * self.radius)
end

function pointerDown(self: Draggable, pointer: Vec2D): boolean
  if hitTest(self, pointer) then
    self.isDragging = true
    self.dragOffset = Vec2D.xy(
      self.position.x - pointer.x,
      self.position.y - pointer.y
    )
    return true
  end
  return false
end

function pointerMove(self: Draggable, pointer: Vec2D)
  if self.isDragging then
    self.position = Vec2D.xy(
      pointer.x + self.dragOffset.x,
      pointer.y + self.dragOffset.y
    )
  end
end

function pointerUp(self: Draggable, pointer: Vec2D)
  self.isDragging = false
end

function draw(self: Draggable, renderer: Renderer)
  self.path:reset()
  self.path:addOval(AABB.xywh(
    self.position.x - self.radius,
    self.position.y - self.radius,
    self.radius * 2,
    self.radius * 2
  ))
  renderer:drawPath(self.path, self.paint)
end

return function(): Node<Draggable>
  local paint = Paint.new()
  paint:setColor(Color.rgb(100, 150, 255))

  return {
    pointerDown = pointerDown,
    pointerMove = pointerMove,
    pointerUp = pointerUp,
    draw = draw,
    path = Path.new(),
    paint = paint,
    position = Vec2D.xy(100, 100),
    radius = 40,
    isDragging = false,
    dragOffset = Vec2D.origin(),
  }
end
```

### Toggle Button

```lua
type Toggle = {
  path: Path,
  onPaint: Paint,
  offPaint: Paint,
  isOn: boolean,
  bounds: AABB,
}

function pointerDown(self: Toggle, pointer: Vec2D): boolean
  if self.bounds:contains(pointer) then
    self.isOn = not self.isOn
    return true
  end
  return false
end

function draw(self: Toggle, renderer: Renderer)
  self.path:reset()
  self.path:addRoundedRect(self.bounds, 10)

  local paint = if self.isOn then self.onPaint else self.offPaint
  renderer:drawPath(self.path, paint)
end

return function(): Node<Toggle>
  local onPaint = Paint.new()
  onPaint:setColor(Color.rgb(100, 200, 100))

  local offPaint = Paint.new()
  offPaint:setColor(Color.rgb(150, 150, 150))

  return {
    pointerDown = pointerDown,
    draw = draw,
    path = Path.new(),
    onPaint = onPaint,
    offPaint = offPaint,
    isOn = false,
    bounds = AABB.xywh(0, 0, 80, 40),
  }
end
```

### Slider Control

```lua
type Slider = {
  path: Path,
  trackPaint: Paint,
  thumbPaint: Paint,
  value: number,  -- 0 to 1
  trackBounds: AABB,
  thumbRadius: number,
  isDragging: boolean,
}

function getThumbPosition(self: Slider): Vec2D
  local x = self.trackBounds.minX + self.value * self.trackBounds:width()
  local y = self.trackBounds:center().y
  return Vec2D.xy(x, y)
end

function pointerDown(self: Slider, pointer: Vec2D): boolean
  local thumb = getThumbPosition(self)
  local dx = pointer.x - thumb.x
  local dy = pointer.y - thumb.y
  local dist = math.sqrt(dx * dx + dy * dy)

  if dist <= self.thumbRadius then
    self.isDragging = true
    return true
  end
  return false
end

function pointerMove(self: Slider, pointer: Vec2D)
  if self.isDragging then
    local range = self.trackBounds:width()
    local x = pointer.x - self.trackBounds.minX
    self.value = math.max(0, math.min(1, x / range))
  end
end

function pointerUp(self: Slider, pointer: Vec2D)
  self.isDragging = false
end

function draw(self: Slider, renderer: Renderer)
  -- Draw track
  self.path:reset()
  self.path:addRoundedRect(self.trackBounds, 3)
  renderer:drawPath(self.path, self.trackPaint)

  -- Draw thumb
  local thumb = getThumbPosition(self)
  self.path:reset()
  self.path:addOval(AABB.xywh(
    thumb.x - self.thumbRadius,
    thumb.y - self.thumbRadius,
    self.thumbRadius * 2,
    self.thumbRadius * 2
  ))
  renderer:drawPath(self.path, self.thumbPaint)
end

return function(): Node<Slider>
  local trackPaint = Paint.new()
  trackPaint:setColor(Color.rgb(200, 200, 200))

  local thumbPaint = Paint.new()
  thumbPaint:setColor(Color.rgb(100, 150, 255))

  return {
    pointerDown = pointerDown,
    pointerMove = pointerMove,
    pointerUp = pointerUp,
    draw = draw,
    path = Path.new(),
    trackPaint = trackPaint,
    thumbPaint = thumbPaint,
    value = 0.5,
    trackBounds = AABB.xywh(0, 0, 200, 6),
    thumbRadius = 12,
    isDragging = false,
  }
end
```

## Best Practices

1. **Return true to capture** - Only capture if you'll handle the interaction
2. **Store offset for dragging** - Calculate offset at pointerDown, apply at pointerMove
3. **Clamp values** - Ensure dragged values stay in bounds
4. **Visual feedback** - Change color/size when pressed or hovered
5. **Use hit testing** - Check if pointer is within interactive area

## Common Pitfalls

**Forgetting to return true**
```lua
-- Bad: never receives move/up
function pointerDown(self, pointer: Vec2D): boolean
  self.isPressed = true
  -- Missing return true!
end

-- Good: captures pointer
function pointerDown(self, pointer: Vec2D): boolean
  self.isPressed = true
  return true
end
```

**Not handling edge cases**
```lua
-- Bad: position can go negative or past bounds
function pointerMove(self, pointer: Vec2D)
  self.value = pointer.x / self.width
end

-- Good: clamp value
function pointerMove(self, pointer: Vec2D)
  self.value = math.max(0, math.min(1, pointer.x / self.width))
end
```

**Pointer coordinates**
```lua
-- Pointer coordinates are in the node's local space
-- If the node is transformed, pointer is pre-transformed
function pointerDown(self, pointer: Vec2D): boolean
  -- pointer.x and pointer.y are relative to this node
  return self.bounds:contains(pointer)
end
```
