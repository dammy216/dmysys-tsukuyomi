---
name: data-binding
description: Connecting scripts to data with ViewModel, Property, and Triggers
metadata:
  tags: rive, scripting, data-binding, viewmodel, property
---

# Data Binding in Rive Scripts

Rive scripts can read and write data through ViewModels, enabling dynamic content and interactivity.

## ViewModel Access

Access the ViewModel through the script's context:

```lua
type DataDriven = {
  paint: Paint,
  path: Path,
  viewModel: ViewModel?,
}

function init(self: DataDriven)
  -- Get ViewModel from context
  self.viewModel = self.context:getViewModel()
end

function draw(self: DataDriven, renderer: Renderer)
  if self.viewModel then
    local value = self.viewModel:getNumber("progress")
    -- Use value...
  end
end

return function(): Node<DataDriven>
  return {
    init = init,
    draw = draw,
    paint = Paint.new(),
    path = Path.new(),
    viewModel = nil,
  }
end
```

## Property Types

### Number Properties

```lua
-- Read number
local value = viewModel:getNumber("propertyName")

-- Write number
viewModel:setNumber("propertyName", 42.5)
```

### String Properties

```lua
-- Read string
local text = viewModel:getString("label")

-- Write string
viewModel:setString("label", "Hello World")
```

### Boolean Properties

```lua
-- Read boolean
local isActive = viewModel:getBoolean("active")

-- Write boolean
viewModel:setBoolean("active", true)
```

### Color Properties

```lua
-- Read color
local color = viewModel:getColor("backgroundColor")

-- Write color
viewModel:setColor("backgroundColor", Color.rgb(255, 100, 100))
```

### Enum Properties

```lua
-- Read enum (returns string)
local state = viewModel:getEnum("status")

-- Write enum
viewModel:setEnum("status", "active")
```

## Triggers

Triggers are one-shot events from the ViewModel:

```lua
type TriggerHandler = {
  viewModel: ViewModel?,
  flashAlpha: number,
}

function init(self: TriggerHandler)
  self.viewModel = self.context:getViewModel()

  -- Listen for trigger
  if self.viewModel then
    self.viewModel:onTrigger("flash", function()
      self.flashAlpha = 1
    end)
  end
end

function advance(self: TriggerHandler, elapsed: number)
  -- Fade out flash
  if self.flashAlpha > 0 then
    self.flashAlpha = math.max(0, self.flashAlpha - elapsed * 2)
  end
end

-- Fire a trigger from script
function fireTrigger(self: TriggerHandler)
  if self.viewModel then
    self.viewModel:fireTrigger("buttonPressed")
  end
end

return function(): Node<TriggerHandler>
  return {
    init = init,
    advance = advance,
    viewModel = nil,
    flashAlpha = 0,
  }
end
```

## Property Change Subscriptions

React to data changes:

```lua
type Subscriber = {
  viewModel: ViewModel?,
  unsubscribe: (() -> ())?,
  currentValue: number,
}

function init(self: Subscriber)
  self.viewModel = self.context:getViewModel()

  if self.viewModel then
    -- Subscribe to changes
    self.unsubscribe = self.viewModel:subscribe("score", function(newValue)
      self.currentValue = newValue
      -- React to change
    end)

    -- Get initial value
    self.currentValue = self.viewModel:getNumber("score")
  end
end

function cleanup(self: Subscriber)
  -- Unsubscribe when script is removed
  if self.unsubscribe then
    self.unsubscribe()
  end
end

return function(): Node<Subscriber>
  return {
    init = init,
    cleanup = cleanup,
    viewModel = nil,
    unsubscribe = nil,
    currentValue = 0,
  }
end
```

## Complete Examples

### Progress Bar

```lua
type ProgressBar = {
  path: Path,
  bgPaint: Paint,
  fgPaint: Paint,
  viewModel: ViewModel?,
  width: number,
  height: number,
}

function init(self: ProgressBar)
  self.viewModel = self.context:getViewModel()

  self.bgPaint:setColor(Color.rgb(200, 200, 200))
  self.fgPaint:setColor(Color.rgb(100, 200, 100))
end

function draw(self: ProgressBar, renderer: Renderer)
  local progress = 0
  if self.viewModel then
    progress = self.viewModel:getNumber("progress") -- 0-1
    progress = math.max(0, math.min(1, progress))
  end

  -- Background
  self.path:reset()
  self.path:addRoundedRect(AABB.xywh(0, 0, self.width, self.height), 4)
  renderer:drawPath(self.path, self.bgPaint)

  -- Foreground
  if progress > 0 then
    self.path:reset()
    self.path:addRoundedRect(AABB.xywh(0, 0, self.width * progress, self.height), 4)
    renderer:drawPath(self.path, self.fgPaint)
  end
end

return function(): Node<ProgressBar>
  return {
    init = init,
    draw = draw,
    path = Path.new(),
    bgPaint = Paint.new(),
    fgPaint = Paint.new(),
    viewModel = nil,
    width = 200,
    height = 20,
  }
end
```

### Dynamic Color

```lua
type DynamicColor = {
  path: Path,
  paint: Paint,
  viewModel: ViewModel?,
}

function init(self: DynamicColor)
  self.viewModel = self.context:getViewModel()
end

function draw(self: DynamicColor, renderer: Renderer)
  if self.viewModel then
    local color = self.viewModel:getColor("themeColor")
    self.paint:setColor(color)
  end

  self.path:reset()
  self.path:addRect(AABB.xywh(0, 0, 100, 100))
  renderer:drawPath(self.path, self.paint)
end

return function(): Node<DynamicColor>
  return {
    init = init,
    draw = draw,
    path = Path.new(),
    paint = Paint.new(),
    viewModel = nil,
  }
end
```

### Score Display

```lua
type ScoreDisplay = {
  viewModel: ViewModel?,
  currentScore: number,
  displayScore: number,  -- Animated value
  path: Path,
  paint: Paint,
}

function init(self: ScoreDisplay)
  self.viewModel = self.context:getViewModel()

  if self.viewModel then
    self.currentScore = self.viewModel:getNumber("score")
    self.displayScore = self.currentScore

    self.viewModel:subscribe("score", function(newScore)
      self.currentScore = newScore
      -- displayScore will animate toward currentScore
    end)
  end
end

function advance(self: ScoreDisplay, elapsed: number)
  -- Animate toward current score
  local diff = self.currentScore - self.displayScore
  if math.abs(diff) > 0.5 then
    self.displayScore = self.displayScore + diff * elapsed * 10
  else
    self.displayScore = self.currentScore
  end
end

function draw(self: ScoreDisplay, renderer: Renderer)
  local score = math.floor(self.displayScore)
  -- Draw score (in practice, you'd draw text or number shapes)
end

return function(): Node<ScoreDisplay>
  return {
    init = init,
    advance = advance,
    draw = draw,
    viewModel = nil,
    currentScore = 0,
    displayScore = 0,
    path = Path.new(),
    paint = Paint.new(),
  }
end
```

### Toggle with Sync

```lua
type SyncedToggle = {
  path: Path,
  paint: Paint,
  viewModel: ViewModel?,
  isOn: boolean,
  bounds: AABB,
}

function init(self: SyncedToggle)
  self.viewModel = self.context:getViewModel()

  if self.viewModel then
    self.isOn = self.viewModel:getBoolean("enabled")

    self.viewModel:subscribe("enabled", function(newValue)
      self.isOn = newValue
    end)
  end
end

function pointerDown(self: SyncedToggle, pointer: Vec2D): boolean
  if self.bounds:contains(pointer) then
    self.isOn = not self.isOn

    -- Sync back to ViewModel
    if self.viewModel then
      self.viewModel:setBoolean("enabled", self.isOn)
    end

    return true
  end
  return false
end

function draw(self: SyncedToggle, renderer: Renderer)
  local color = if self.isOn
    then Color.rgb(100, 200, 100)
    else Color.rgb(150, 150, 150)

  self.paint:setColor(color)
  self.path:reset()
  self.path:addRoundedRect(self.bounds, 20)
  renderer:drawPath(self.path, self.paint)
end

return function(): Node<SyncedToggle>
  return {
    init = init,
    pointerDown = pointerDown,
    draw = draw,
    path = Path.new(),
    paint = Paint.new(),
    viewModel = nil,
    isOn = false,
    bounds = AABB.xywh(0, 0, 60, 30),
  }
end
```

## Best Practices

1. **Null check ViewModel** - It may not be available
2. **Use subscriptions for reactive updates** - Don't poll in draw()
3. **Unsubscribe on cleanup** - Prevent memory leaks
4. **Clamp values** - Don't trust data to be in valid range
5. **Animate changes** - Interpolate for smooth transitions

## Common Pitfalls

**Not checking for nil ViewModel**
```lua
-- Bad: crashes if no ViewModel
function init(self)
  local value = self.context:getViewModel():getNumber("value")
end

-- Good: check first
function init(self)
  local vm = self.context:getViewModel()
  if vm then
    local value = vm:getNumber("value")
  end
end
```

**Polling in draw**
```lua
-- Bad: gets value every frame
function draw(self, renderer)
  local value = self.viewModel:getNumber("expensive")  -- Called 60 times/sec
end

-- Good: subscribe and cache
function init(self)
  self.cachedValue = self.viewModel:getNumber("expensive")
  self.viewModel:subscribe("expensive", function(v)
    self.cachedValue = v
  end)
end

function draw(self, renderer)
  local value = self.cachedValue  -- Uses cached value
end
```

**Forgetting to unsubscribe**
```lua
-- Bad: leaks subscription
function init(self)
  self.viewModel:subscribe("value", function(v) ... end)
end

-- Good: store and clean up
function init(self)
  self.unsub = self.viewModel:subscribe("value", function(v) ... end)
end

function cleanup(self)
  if self.unsub then self.unsub() end
end
```
