document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap components
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize charts
    initCharts();
    
    // Load system status
    loadSystemStatus();
    
    // Load service health
    loadServiceHealth();
    
    // Set up refresh button
    document.getElementById('refreshBtn').addEventListener('click', function(e) {
        e.preventDefault();
        loadSystemStatus();
        loadServiceHealth();
        updateCharts();
    });
    
    // Set up API try buttons
    setupTryApiButtons();
});

// Initialize charts with sample data
function initCharts() {
    // Request distribution chart
    const requestCtx = document.getElementById('requestChart').getContext('2d');
    window.requestChart = new Chart(requestCtx, {
        type: 'pie',
        data: {
            labels: ['User Service', 'Product Service', 'Order Service'],
            datasets: [{
                data: [30, 40, 30],
                backgroundColor: [
                    'rgba(0, 123, 255, 0.7)',
                    'rgba(40, 167, 69, 0.7)',
                    'rgba(253, 126, 20, 0.7)'
                ],
                borderColor: [
                    'rgba(0, 123, 255, 1)',
                    'rgba(40, 167, 69, 1)',
                    'rgba(253, 126, 20, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'API Request Distribution'
                }
            }
        }
    });
    
    // Response time chart
    const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
    window.responseTimeChart = new Chart(responseTimeCtx, {
        type: 'bar',
        data: {
            labels: ['User Service', 'Product Service', 'Order Service'],
            datasets: [{
                label: 'Average Response Time (ms)',
                data: [45, 32, 58],
                backgroundColor: [
                    'rgba(0, 123, 255, 0.7)',
                    'rgba(40, 167, 69, 0.7)',
                    'rgba(253, 126, 20, 0.7)'
                ],
                borderColor: [
                    'rgba(0, 123, 255, 1)',
                    'rgba(40, 167, 69, 1)',
                    'rgba(253, 126, 20, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Response Time (ms)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Services'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Average Response Times'
                }
            }
        }
    });
}

// Update charts with new data
function updateCharts() {
    // In a real application, this would fetch metrics data from the server
    // For demo purposes, we'll use random data
    
    // Update request distribution chart
    const requestData = [
        Math.floor(Math.random() * 50) + 20,
        Math.floor(Math.random() * 50) + 20,
        Math.floor(Math.random() * 50) + 20
    ];
    window.requestChart.data.datasets[0].data = requestData;
    window.requestChart.update();
    
    // Update response time chart
    const responseTimeData = [
        Math.floor(Math.random() * 50) + 20,
        Math.floor(Math.random() * 50) + 20,
        Math.floor(Math.random() * 50) + 20
    ];
    window.responseTimeChart.data.datasets[0].data = responseTimeData;
    window.responseTimeChart.update();
}

// Load system status
function loadSystemStatus() {
    fetch('/health')
        .then(response => response.json())
        .then(data => {
            const uptime = formatUptime(data.uptime);
            const statusHtml = `
                <ul class="list-group">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        API Gateway
                        <span class="status-online">Online</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        Consul
                        <span class="${data.consul === 'connected' ? 'status-online' : 'status-fallback'}">
                            ${data.consul === 'connected' ? 'Connected' : 'Fallback Mode'}
                        </span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        Uptime
                        <span>${uptime}</span>
                    </li>
                </ul>
            `;
            document.getElementById('system-status').innerHTML = statusHtml;
        })
        .catch(error => {
            console.error('Error fetching system status:', error);
            document.getElementById('system-status').innerHTML = '<div class="alert alert-danger">Error fetching system status</div>';
        });
}

// Load service health
function loadServiceHealth() {
    fetch('/status')
        .then(response => response.json())
        .then(data => {
            let healthHtml = '<div class="row">';
            
            data.services.forEach(service => {
                const statusClass = service.status === 'online' ? 'service-status-online' : 
                                   (service.status === 'offline' ? 'service-status-offline' : 'service-status-error');
                const statusIcon = service.status === 'online' ? 'bi-check-circle-fill' : 
                                  (service.status === 'offline' ? 'bi-x-circle-fill' : 'bi-exclamation-triangle-fill');
                const statusText = service.status.charAt(0).toUpperCase() + service.status.slice(1);
                
                healthHtml += `
                    <div class="col-md-4">
                        <div class="service-status-card ${statusClass}">
                            <h5><i class="bi ${statusIcon}"></i> ${service.name}</h5>
                            <p class="mb-1"><strong>Status:</strong> <span class="status-${service.status}">${statusText}</span></p>
                            ${service. status === 'online' ? `<p class="mb-0"><strong>Uptime:</strong> ${formatUptime(service.details.uptime)}</p>` : 
                            `<p class="mb-0"><strong>Error:</strong> ${service.details.error}</p>`}
                        </div>
                    </div>
                `;
            });
            
            healthHtml += '</div>';
            document.getElementById('service-health').innerHTML = healthHtml;
        })
        .catch(error => {
            console.error('Error fetching service health:', error);
            document.getElementById('service-health').innerHTML = '<div class="alert alert-danger">Error fetching service health</div>';
        });
}

// Format uptime in a human-readable format
function formatUptime(uptime) {
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

// Set up API try buttons
function setupTryApiButtons() {
    const tryButtons = document.querySelectorAll('.try-api');
    let currentButton = null;
    let currentEndpoint = '';
    let currentMethod = '';
    let currentBody = null;
    
    // Set up ID input modal
    const idInputModal = new bootstrap.Modal(document.getElementById('idInputModal'));
    const idSubmitBtn = document.getElementById('idSubmitBtn');
    
    idSubmitBtn.addEventListener('click', function() {
        const id = document.getElementById('idInput').value.trim();
        if (id) {
            idInputModal.hide();
            const endpoint = currentEndpoint.replace(':id', id);
            makeApiRequest(currentMethod, endpoint, currentBody);
        }
    });
    
    // Set up API response modal
    const apiResponseModal = new bootstrap.Modal(document.getElementById('apiResponseModal'));
    
    tryButtons.forEach(button => {
        button.addEventListener('click', function() {
            const method = this.getAttribute('data-method');
            const endpoint = this.getAttribute('data-endpoint');
            const requiresId = this.getAttribute('data-requires-id') === 'true';
            const bodyAttr = this.getAttribute('data-body');
            const body = bodyAttr ? JSON.parse(bodyAttr) : null;
            
            currentButton = this;
            currentMethod = method;
            currentEndpoint = endpoint;
            currentBody = body;
            
            if (requiresId) {
                document.getElementById('idInput').value = '';
                idInputModal.show();
            } else {
                makeApiRequest(method, endpoint, body);
            }
        });
    });
    
    function makeApiRequest(method, endpoint, body) {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        
        // Show request details
        const requestDetails = {
            method: method,
            endpoint: endpoint,
            body: body
        };
        
        document.getElementById('requestDetails').textContent = JSON.stringify(requestDetails, null, 2);
        document.getElementById('responseDetails').textContent = 'Loading...';
        document.getElementById('apiResponseModalTitle').textContent = `${method} ${endpoint}`;
        
        apiResponseModal.show();
        
        fetch(endpoint, options)
            .then(response => {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return response.json().then(data => ({
                        status: response.status,
                        statusText: response.statusText,
                        data: data
                    }));
                } else {
                    return response.text().then(text => ({
                        status: response.status,
                        statusText: response.statusText,
                        data: text
                    }));
                }
            })
            .then(result => {
                document.getElementById('responseDetails').textContent = JSON.stringify(result, null, 2);
            })
            .catch(error => {
                document.getElementById('responseDetails').textContent = `Error: ${error.message}`;
            });
    }
}