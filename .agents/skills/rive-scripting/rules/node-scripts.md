---
name: node-scripts
description: Node script protocol - lifecycle methods, state management, and the core script pattern
metadata:
  tags: rive, scripting, node, protocol, lifecycle
---

# Node Scripts

Node scripts are the primary script type in Rive. They attach to any Rive object and provide drawing, animation, and interactivity.

## Node Protocol

```lua
type MyNode = {
  -- Your custom state fields
  time: number,
  path: Path,
  paint: Paint,
}

-- Called once when script initializes
function init(self: MyNode)
  self.paint:setColor(Color.rgb(255, 100, 50))
end

-- Called each frame with elapsed time in seconds
function advance(self: MyNode, elapsed: number)
  self.time = self.time + elapsed
end

-- Called after advance for any state updates
function update(self: MyNode)
  -- Update derived state
end

-- Called to render the node
function draw(self: MyNode, renderer: Renderer)
  self.path:reset()
  -- Build path and draw
  renderer:drawPath(self.path, self.paint)
end

-- Factory function - REQUIRED
return function(): Node<MyNode>
  return {
    init = init,
    advance = advance,
    update = update,
    draw = draw,
    time = 0,
    path = Path.new(),
    paint = Paint.new(),
  }
end
```

## Lifecycle Order

Each frame, methods are called in this order:

1. `init(self)` - Once at startup
2. `advance(self, elapsed)` - Every frame, receives delta time
3. `update(self)` - Every frame, after advance
4. `draw(self, renderer)` - Every frame, for rendering

## State Management

### Typed State Pattern

Always define a type for your state:

```lua
type AnimatedShape = {
  -- Drawing resources (create once, reuse)
  path: Path,
  paint: Paint,

  -- Animation state
  time: number,
  phase: number,

  -- Configuration
  speed: number,
  size: number,
}
```

### Initializing State

Initialize heavy objects in the factory, configure in init:

```lua
function init(self: AnimatedShape)
  -- Configure paint
  self.paint:setStyle(PaintStyle.stroke)
  self.paint:setThickness(3)
  self.paint:setColor(Color.rgb(100, 150, 255))
end

return function(): Node<AnimatedShape>
  return {
    init = init,
    advance = advance,
    draw = draw,
    -- Create resources
    path = Path.new(),
    paint = Paint.new(),
    -- Initial values
    time = 0,
    phase = 0,
    speed = 1,
    size = 100,
  }
end
```

## Accessing Node Properties

### Self Bounds

Get the node's bounding box:

```lua
function draw(self: MyNode, renderer: Renderer)
  local bounds = self.bounds -- AABB of this node
  local width = bounds:width()
  local height = bounds:height()
  local center = bounds:center()
end
```

### Parent and Children

```lua
function init(self: MyNode)
  local parent = self.parent
  local children = self.children

  for _, child in children do
    -- Access child nodes
  end
end
```

## Animation Examples

### Pulsing Circle

```lua
type Pulse = {
  path: Path,
  paint: Paint,
  time: number,
}

function advance(self: Pulse, elapsed: number)
  self.time = self.time + elapsed
end

function draw(self: Pulse, renderer: Renderer)
  local scale = 1 + 0.2 * math.sin(self.time * 3)
  local radius = 50 * scale

  self.path:reset()
  self.path:addOval(AABB.xywh(-radius, -radius, radius * 2, radius * 2))

  renderer:drawPath(self.path, self.paint)
end

return function(): Node<Pulse>
  local paint = Paint.new()
  paint:setColor(Color.rgb(255, 100, 100))

  return {
    advance = advance,
    draw = draw,
    path = Path.new(),
    paint = paint,
    time = 0,
  }
end
```

### Rotating Shape

```lua
type Spinner = {
  path: Path,
  paint: Paint,
  angle: number,
  speed: number,
}

function advance(self: Spinner, elapsed: number)
  self.angle = self.angle + self.speed * elapsed
end

function draw(self: Spinner, renderer: Renderer)
  renderer:save()
  renderer:rotate(self.angle)

  self.path:reset()
  self.path:addRect(AABB.xywh(-25, -25, 50, 50))
  renderer:drawPath(self.path, self.paint)

  renderer:restore()
end

return function(): Node<Spinner>
  local paint = Paint.new()
  paint:setStyle(PaintStyle.stroke)
  paint:setThickness(4)
  paint:setColor(Color.rgb(100, 200, 150))

  return {
    advance = advance,
    draw = draw,
    path = Path.new(),
    paint = paint,
    angle = 0,
    speed = 2, -- radians per second
  }
end
```

## Best Practices

1. **Type your state** - Define a type alias for compile-time checks
2. **Create resources in factory** - Path, Paint, etc. should be created once
3. **Reset paths in draw** - Call `path:reset()` at the start of draw
4. **Use elapsed time** - Scale animations by elapsed for frame-rate independence
5. **Save/restore renderer** - Use `save()` and `restore()` when transforming

## Common Pitfalls

**Forgetting elapsed time scaling**
```lua
-- Bad: frame-rate dependent
function advance(self: MyNode, elapsed: number)
  self.angle = self.angle + 0.1 -- Faster at higher FPS
end

-- Good: frame-rate independent
function advance(self: MyNode, elapsed: number)
  self.angle = self.angle + 2 * elapsed -- Consistent speed
end
```

**Not resetting path**
```lua
-- Bad: path accumulates commands
function draw(self: MyNode, renderer: Renderer)
  self.path:moveTo(Vec2D.xy(0, 0))
  self.path:lineTo(Vec2D.xy(100, 100)) -- Adds to existing path!
end

-- Good: reset first
function draw(self: MyNode, renderer: Renderer)
  self.path:reset()
  self.path:moveTo(Vec2D.xy(0, 0))
  self.path:lineTo(Vec2D.xy(100, 100))
end
```

**Missing save/restore**
```lua
-- Bad: transforms affect subsequent drawing
function draw(self: MyNode, renderer: Renderer)
  renderer:translate(Vec2D.xy(100, 100))
  renderer:rotate(self.angle)
  -- Transform persists!
end

-- Good: save and restore
function draw(self: MyNode, renderer: Renderer)
  renderer:save()
  renderer:translate(Vec2D.xy(100, 100))
  renderer:rotate(self.angle)
  renderer:drawPath(self.path, self.paint)
  renderer:restore()
end
```
