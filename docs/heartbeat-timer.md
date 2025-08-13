# Service Worker Timer Architecture

## Quick Links

  📊 [Jam-Build Service Worker `batch-timer` Sequence Diagram](#timer-architecture-sequence-diagram)

## Overview

Jam-Build implements a sophisticated timer system designed to overcome the inherent unreliability of timers in service workers. The architecture uses a cooperative heartbeat mechanism between the main thread and service worker to provide robust timer guarantees while gracefully handling browser resource management scenarios.

## The Problem

Service workers can be terminated unpredictably by the browser, making standard setTimeout() and setInterval() unreliable for critical operations like data synchronization. Traditional timers may never fire if the service worker is shut down, potentially causing data loss.

## The Solution

Heartbeat-Based Timer System

* Service Worker Timer (sw.timer.js): Manages timer state and countdown logic

* Main Thread Heartbeat (heartbeat.js): Monitors user activity and browser state

* Bidirectional Messaging: Coordinates between threads to ensure timer reliability

## Key Components

```javascript
// Start a timer with heartbeat monitoring
startTimer(duration, timerName, callback, resolution = 500);
```

Parameters:

* `duration`: Timer duration in milliseconds (e.g., 67ms for batch window)

* `timerName`: Unique identifier for the timer

* `callback`: Function to execute when timer completes

* `resolution`: Heartbeat check interval (default: 500ms)

## Architecture Flow

1. Timer Initialization

* Service worker creates timer entry and starts countdown

* Heartbeat begins between main thread (475ms interval) and service worker

* Main thread monitors user activity (mouse, keyboard, touch events)

2. Heartbeat Loop

```javascript
// Main thread sends activity status every 475ms
postMessage('heartbeat-beat', {
  name: timerName,
  inactive: userInactiveFor8Seconds
})
```

3. Timer Resolution (Every 500ms)
The service worker checks:

* Natural Expiration: timeLeft <= 0 → execute callback

* Heartbeat Validity: Last heartbeat < 500ms ago

* Client Activity: At least one active client exists

4. Early Termination Triggers
Timers execute immediately when:

* User Inactivity: All clients inactive for 8+ seconds

* Missing Heartbeat: No communication for 500+ ms

* Visibility Change: Browser tab hidden/closed (visibilitychange event)

## Configuration
Default Settings

* Heartbeat Interval: 475ms (95% of resolution)

* Timer Resolution: 500ms

* Inactivity Threshold: 8 seconds (16x resolution)

* Batch Window: <Varies depending on usage/purpose>

### Tuning Guidelines

* Shorter intervals: More responsive, higher CPU usage

* Longer intervals: Less CPU impact, reduced reliability

* Inactivity threshold: Balance between responsiveness and false triggers

## Usage Examples
Basic Timer

```javascript
// 67ms batch collection window
startTimer(67, 'batch-timer', processBatchUpdates);
```

## Extending Timer Window

```javascript
// Each call resets the timer duration
startTimer(67, 'batch-timer', processBatchUpdates); // starts timer
startTimer(67, 'batch-timer', processBatchUpdates); // extends window
```

## Emergency Service All Timers
```javascript
serviceAllTimers(); // Execute all pending timers immediately
```

## Browser Event Handling

### Visibility Change
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Service all timers before potential SW shutdown
    serviceAllTimers();
  }
});
```

### User Activity Monitoring
Tracks activity via:

* `mousemove`

* `keydown`

* `touchstart`

## Error Handling & Reliability

### Guarantees

✅ Data Protection: Timers execute early rather than risk data loss

✅ Graceful Degradation: System continues functioning with degraded heartbeat

✅ Multi-Client Support: Coordinates across multiple browser tabs

✅ Resource Efficiency: Optimized intervals minimize main thread impact

### Limitations

⚠️ No Absolute Guarantees: Service workers can still be terminated unexpectedly

⚠️ Network Dependencies: Assumes service worker message passing works

⚠️ Activity Detection: Limited to monitored DOM events

## Performance Considerations

### CPU Impact

* **Main Thread**: ~2ms every 475ms for heartbeat

* **Service Worker**: ~1ms every 500ms for resolution check

* **Memory**: Minimal overhead (~100 bytes per active timer)

### Network Impact

* **Zero network calls**: Pure inter-thread messaging

* **Message frequency**: ~2 messages per second during active timers

## Best Practices

* **Use Descriptive Timer Names**: Enable easier debugging and coordination

* **Handle Early Termination**: Design callbacks to be idempotent

* **Monitor Performance**: Watch for excessive timer creation/destruction

* **Test Offline Scenarios**: Verify behavior during network disruptions

* **Consider Exponential Backoff**: For retry scenarios, implement progressive delays

## Integration Notes

This timer architecture is specifically designed for Jam-Build's batch processing system but can be adapted for other service worker timing requirements. The heartbeat mechanism provides a foundation for any scenario where timer reliability is critical for data integrity.

## Timer Architecture Sequence Diagram

[Full Timer Architecture Diagram (mermaid)](diagrams/timer-architecture-diagram.mermaid)

```mermaid
sequenceDiagram
    participant User as User Interaction
    participant MT as Main Thread<br/>(heartbeat.js)
    participant SW as Service Worker<br/>(sw.timer.js)
    participant SWD as SW Data Module<br/>(sw.data.js)
    participant Browser as Browser Events<br/>(visibilitychange)

    Note over User, Browser: Timer starts from batch update operation

    SWD->>SW: startTimer(duration, 'batch-timer', processBatchUpdates)
    Note right of SW: duration = 67ms (batchCollectionWindow)<br/>resolution = 500ms (default)

    alt New Timer
        SW->>SW: Create timer entry in timers object
        SW->>MT: sendMessage('heartbeat-start', {name, interval, maxInactive})
        Note right of MT: interval = 475ms (95% of resolution)<br/>maxInactive = 8000ms (16x resolution)
        
        MT->>MT: heartbeatStart() - setup monitoring
        MT->>User: addEventListener(mousemove, keydown, touchstart)
        Note right of User: Track user activity for inactivity detection
        
        MT->>MT: setInterval() - start heartbeat loop
        MT->>SW: postMessage('heartbeat-start', {name})
        
        SW->>SW: Store client heartbeat map
        Note right of SW: heartbeat[name] = Map([[clientId, {time, inactive}]])
        
    else Existing Timer (Reset)
        SW->>SW: clearInterval() existing timer
        Note right of SW: Timer window extends - no new heartbeat needed
    end

    SW->>SW: setInterval() - start timer countdown
    Note right of SW: Runs every 500ms, decrements timeLeft

    Note over MT, SW: Heartbeat messaging loop begins

    loop Every 475ms (while timer active)
        MT->>MT: Check user activity against maxInactive (8s)
        
        alt User Active (< 8s since activity)
            MT->>SW: postMessage('heartbeat-beat', {name, inactive: false})
        else User Inactive (≥ 8s since activity)  
            MT->>SW: postMessage('heartbeat-beat', {name, inactive: true})
        end
        
        SW->>SW: Update heartbeat map with timestamp & activity
    end

    Note over SW, SWD: Timer resolution check every 500ms

    loop Every 500ms (timer resolution)
        SW->>SW: Decrement timeLeft by resolution (500ms)
        
        alt timeLeft <= 0 (Timer Expired)
            SW->>SW: serviceTimer() - natural expiration
            SW->>SWD: Execute callback (processBatchUpdates)
            SW->>SW: stopHeartbeat() & cleanup timer
            SW->>MT: sendMessage('heartbeat-stop', {name})
            MT->>MT: Clear intervals & event listeners
            
        else timeLeft > 0 (Timer Still Running)
            SW->>SW: checkHeartbeat(name, resolution)
            
            alt Valid Heartbeat & Active Clients
                Note right of SW: lastHeartbeat < 500ms ago<br/>AND at least one client active
                SW->>SW: Continue timer (do nothing)
                
            else Invalid Heartbeat OR All Clients Inactive
                Note right of SW: lastHeartbeat ≥ 500ms ago<br/>OR all clients report inactive
                SW->>SW: serviceTimer() - early termination
                SW->>SWD: Execute callback (processBatchUpdates)
                Note right of SWD: Process batch immediately<br/>to preserve user data
                SW->>SW: stopHeartbeat() & cleanup timer
                SW->>MT: sendMessage('heartbeat-stop', {name})
            end
        end
    end

    Note over Browser, SW: Browser visibility change handling

    Browser->>MT: visibilitychange event (state = 'hidden')
    Note right of Browser: Browser tab hidden, closed,<br/>or minimized - risk of SW shutdown
    
    MT->>MT: visibilityHandler() triggered
    MT->>MT: heartbeatStop() for all active timers
    MT->>SW: postMessage('service-timers-now', {timerNames})
    
    SW->>SW: serviceTimer() for each requested timer
    loop For each timer in timerNames
        SW->>SWD: Execute callback immediately
        Note right of SWD: Emergency processing before<br/>potential SW termination
        SW->>SW: Cleanup timer state
    end

    Note over User, Browser: Multiple timer coordination

    opt Multiple Timers Active
        Note over SW: Each timer has independent:<br/>- Heartbeat tracking<br/>- Resolution checking<br/>- Early termination logic
        
        alt serviceAllTimers() called
            SW->>SW: Service ALL active timers immediately
            Note right of SW: Used for logout or emergency scenarios
        end
    end
```