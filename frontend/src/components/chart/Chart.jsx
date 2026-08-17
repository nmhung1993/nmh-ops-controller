import React, { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

function ChartComponent({ type, series, options, height = 300, ...other }) {
  const theme = useTheme();

  const customOptions = useMemo(() => ({
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: false, // Disabling dynamic redraw animation prevents main-thread stutter on live streams
        dynamicAnimation: {
          enabled: false
        }
      },
      foreColor: theme.palette.text.disabled,
      fontFamily: theme.typography.fontFamily,
      ...options?.chart
    },
    states: {
      hover: {
        filter: {
          type: 'lighten',
          value: 0.04
        }
      },
      active: {
        filter: {
          type: 'darken',
          value: 0.88
        }
      }
    },
    fill: {
      opacity: 1,
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        opacityFrom: 0.4,
        opacityTo: 0.05,
        stops: [0, 100]
      },
      ...options?.fill
    },
    dataLabels: { enabled: false, ...options?.dataLabels },
    stroke: {
      width: 2.5,
      curve: 'smooth',
      lineCap: 'round',
      ...options?.stroke
    },
    grid: {
      strokeDashArray: 3,
      borderColor: theme.palette.divider,
      xaxis: {
        lines: { show: false }
      },
      ...options?.grid
    },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      ...options?.xaxis
    },
    markers: {
      size: 0,
      strokeColors: theme.palette.background.paper,
      ...options?.markers
    },
    tooltip: {
      theme: theme.palette.mode,
      x: { show: true },
      ...options?.tooltip
    },
    legend: {
      show: true,
      fontSize: 13,
      position: 'top',
      horizontalAlign: 'right',
      markers: {
        radius: 12
      },
      fontWeight: 500,
      itemMargin: { horizontal: 8 },
      labels: {
        colors: theme.palette.text.primary
      },
      ...options?.legend
    },
    ...options
  }), [theme.palette.mode, theme.palette.text.disabled, theme.palette.text.primary, theme.palette.divider, theme.palette.background.paper, theme.typography.fontFamily, options]);

  return (
    <Box
      sx={{
        '& .apexcharts-canvas': {
          width: '100% !important'
        },
        '& .apexcharts-tooltip': {
          borderRadius: '10px !important',
          boxShadow: `${theme.customShadows?.dropdown || '0 8px 16px rgba(0,0,0,0.1)'} !important`,
          border: `1px solid ${theme.palette.divider} !important`,
          backgroundColor: `${theme.palette.background.paper} !important`,
          color: `${theme.palette.text.primary} !important`
        }
      }}
    >
      <ReactApexChart type={type} series={series} options={customOptions} height={height} {...other} />
    </Box>
  );
}

const Chart = React.memo(ChartComponent);
export default Chart;
